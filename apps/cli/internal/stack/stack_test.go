package stack

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

func testState() *state.State {
	st := state.New()
	st.App = state.App{Version: "1.4.0", Images: state.Images{
		App:       "ghcr.io/trymetis/metis:1.4.0",
		Preflight: "ghcr.io/trymetis/metis:1.4.0-preflight",
		Worker:    "ghcr.io/trymetis/metis:1.4.0-worker",
	}}
	st.Components = state.Components{
		Sqld:    &state.Sqld{},
		Updater: &state.UpdaterComponent{Mode: state.UpdaterDocker},
		Worker:  &state.Worker{Replicas: 2},
		Redis:   &state.Redis{},
	}
	return st
}

func testStack(t *testing.T) (*Stack, *fakeEngine) {
	t.Helper()
	dir := t.TempDir()
	writeEnv(t, dir, "SQLD_AUTH_JWT_KEY=jwt\nSQLD_ADMIN_KEY=admin\nBETTER_AUTH_URL=http://localhost:3000\n")
	engine := newFakeEngine()
	stack := New(engine, dir)
	stack.Logf = func(string, ...any) {}
	return stack, engine
}

func writeEnv(t *testing.T, dir, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func envValue(env []string, key string) (string, bool) {
	for _, entry := range env {
		if name, value, _ := strings.Cut(entry, "="); name == key {
			return value, true
		}
	}
	return "", false
}

func TestBuildSpec(t *testing.T) {
	stack, _ := testStack(t)
	cat, err := stack.Catalog(context.Background(), testState())
	if err != nil {
		t.Fatal(err)
	}

	sqldService, _ := cat.Service("sqld")
	sqld, err := BuildSpec(sqldService, 1, cat.Volumes, nil)
	if err != nil {
		t.Fatal(err)
	}
	if sqld.Name != "metis-sqld" || sqld.Config.Labels[LabelComponent] != "sqld" || sqld.Config.Labels[LabelManaged] != "true" {
		t.Fatalf("sqld identity %s %v", sqld.Name, sqld.Config.Labels)
	}
	if value, _ := envValue(sqld.Config.Env, "LIBSQL_ADMIN_AUTH_KEY"); value != "admin" {
		t.Fatalf("sqld env %v", sqld.Config.Env)
	}
	if sqld.Config.Healthcheck == nil || sqld.Config.Healthcheck.Interval != 2*time.Second || sqld.Config.Healthcheck.Retries != 30 {
		t.Fatalf("sqld healthcheck %+v", sqld.Config.Healthcheck)
	}
	if *sqld.Config.StopTimeout != 30 || sqld.Host.RestartPolicy.Name != container.RestartPolicyUnlessStopped {
		t.Fatalf("sqld stop %d restart %s", *sqld.Config.StopTimeout, sqld.Host.RestartPolicy.Name)
	}
	if len(sqld.Host.PortBindings) != 2 {
		t.Fatalf("sqld ports %v", sqld.Host.PortBindings)
	}
	for _, bindings := range sqld.Host.PortBindings {
		if bindings[0].HostIP.String() != "127.0.0.1" || bindings[0].HostPort != "" {
			t.Fatalf("sqld binding %+v", bindings)
		}
	}
	if mount := sqld.Host.Mounts[0]; mount.Type != "volume" || mount.Source != "metis-sqld" || mount.Target != "/var/lib/sqld" {
		t.Fatalf("sqld mount %+v", mount)
	}
	if aliases := sqld.Network.EndpointsConfig["metis"].Aliases; strings.Join(aliases, ",") != "sqld,app.sqld,mastra.sqld,resend.sqld" {
		t.Fatalf("sqld aliases %v", aliases)
	}

	appService, _ := cat.Service("app")
	app, err := BuildSpec(appService, 1, cat.Volumes, map[string]string{"EXTRA": "1"})
	if err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]string{"BETTER_AUTH_URL": "http://localhost:3000", "METIS_UPDATER_SOCKET": "/run/metis-updater/updater.sock", "EXTRA": "1"} {
		if value, _ := envValue(app.Config.Env, key); value != want {
			t.Fatalf("app %s=%q in %v", key, value, app.Config.Env)
		}
	}
	if mount := app.Host.Mounts[0]; mount.Type != "volume" || mount.Source != "metis-updater" || !mount.ReadOnly {
		t.Fatalf("app mount %+v", mount)
	}

	workerService, _ := cat.Service("worker")
	worker, _ := BuildSpec(workerService, 2, cat.Volumes, nil)
	if worker.Name != "metis-worker-2" || *worker.Config.StopTimeout != 75 {
		t.Fatalf("worker %s %d", worker.Name, *worker.Config.StopTimeout)
	}

	preflightService, _ := cat.Service("preflight")
	preflight, _ := BuildSpec(preflightService, 1, cat.Volumes, nil)
	if !preflight.OneShot || preflight.Host.RestartPolicy.Name != container.RestartPolicyDisabled {
		t.Fatalf("preflight %+v", preflight.Host.RestartPolicy)
	}

	updaterService, _ := cat.Service("updater")
	updater, _ := BuildSpec(updaterService, 1, cat.Volumes, nil)
	binds := map[string]string{}
	for _, entry := range updater.Host.Mounts {
		if entry.Type == mount.TypeBind {
			binds[entry.Source] = entry.Target
		}
	}
	if binds["/usr/local/bin/metis"] != "/metis" || binds["/var/run/docker.sock"] != "/var/run/docker.sock" || binds[stack.InstallDir] != stack.InstallDir {
		t.Fatalf("updater binds %v", binds)
	}
}

func TestHash(t *testing.T) {
	stack, _ := testStack(t)
	cat, _ := stack.Catalog(context.Background(), testState())
	service, _ := cat.Service("app")
	spec, _ := BuildSpec(service, 1, cat.Volumes, nil)
	first, _ := Hash(spec, "sha256:a")
	again, _ := Hash(spec, "sha256:a")
	if first != again {
		t.Fatal("the same spec hashed twice differs")
	}
	spec.Config.Labels[LabelSpec] = first
	labelled, _ := Hash(spec, "sha256:a")
	if labelled != first {
		t.Fatal("the spec label changes the hash")
	}
	if other, _ := Hash(spec, "sha256:b"); other == first {
		t.Fatal("a new image digest keeps the hash")
	}
	writeEnv(t, stack.InstallDir, "SQLD_AUTH_JWT_KEY=jwt\nSQLD_ADMIN_KEY=admin\nBETTER_AUTH_URL=https://mail.example.com\n")
	changed, _ := BuildSpec(service, 1, cat.Volumes, nil)
	if next, _ := Hash(changed, "sha256:a"); next == first {
		t.Fatal("a new .env keeps the hash")
	}
}

func TestApplyOrderAndIdempotence(t *testing.T) {
	stack, engine := testStack(t)
	ctx := context.Background()
	var afterSqld []string
	opts := Options{AfterSqld: func(context.Context) error {
		afterSqld = slices.Clone(engine.callsWith("create "))
		return nil
	}}
	plan, err := stack.Apply(ctx, testState(), opts)
	if err != nil {
		t.Fatal(err)
	}
	created := engine.callsWith("create ")
	want := []string{"metis-sqld", "metis-redis", "metis-preflight", "metis-app", "metis-worker-1", "metis-worker-2", "metis-updater"}
	if strings.Join(created, ",") != strings.Join(want, ",") {
		t.Fatalf("created %v, want %v", created, want)
	}
	if strings.Join(afterSqld, ",") != "metis-sqld" {
		t.Fatalf("AfterSqld ran after %v", afterSqld)
	}
	if !plan.Preflight || len(plan.Create) != 6 {
		t.Fatalf("plan %+v", plan)
	}
	if _, ok := engine.containers["metis-preflight"]; ok {
		t.Fatal("the preflight container was left behind")
	}
	if !engine.network || !engine.volumes["metis-sqld"] || !engine.volumes["metis-updater"] {
		t.Fatalf("network %v volumes %v", engine.network, engine.volumes)
	}

	engine.calls = nil
	plan, err = stack.Apply(ctx, testState(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if !plan.Empty() || len(engine.callsWith("create ")) != 0 || len(engine.callsWith("remove ")) != 0 {
		t.Fatalf("second apply changed things: %+v %v", plan, engine.calls)
	}
}

func TestApplyRecreatesOnlyWhatChanged(t *testing.T) {
	stack, engine := testStack(t)
	ctx := context.Background()
	if _, err := stack.Apply(ctx, testState(), Options{}); err != nil {
		t.Fatal(err)
	}
	engine.calls = nil
	writeEnv(t, stack.InstallDir, "SQLD_AUTH_JWT_KEY=jwt\nSQLD_ADMIN_KEY=admin\nBETTER_AUTH_URL=https://mail.example.com\n")
	plan, err := stack.Apply(ctx, testState(), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(plan.Recreate, ",") != "metis-app,metis-worker-1,metis-worker-2" || !plan.Preflight {
		t.Fatalf("plan %+v", plan)
	}
	if created := engine.callsWith("create "); strings.Join(created, ",") != "metis-preflight,metis-app,metis-worker-1,metis-worker-2" {
		t.Fatalf("created %v", created)
	}
}

func TestApplyRemovesOrphansAndKeeps(t *testing.T) {
	stack, engine := testStack(t)
	ctx := context.Background()
	if _, err := stack.Apply(ctx, testState(), Options{}); err != nil {
		t.Fatal(err)
	}
	engine.containers["someone-else"] = &fakeContainer{config: &container.Config{Labels: map[string]string{}}, host: &container.HostConfig{}, running: true}
	st := testState()
	st.Components.Worker = nil
	st.Components.Redis = nil
	st.App.Images.App = "ghcr.io/trymetis/metis:1.5.0"
	st.Components.Updater = &state.UpdaterComponent{Mode: state.UpdaterDocker}
	engine.calls = nil
	plan, err := stack.Apply(ctx, st, Options{Keep: []string{"updater"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(plan.Remove, ",") != "metis-redis,metis-worker-1,metis-worker-2" {
		t.Fatalf("removed %v", plan.Remove)
	}
	if _, ok := engine.containers["someone-else"]; !ok {
		t.Fatal("an unmanaged container was removed")
	}
	if slices.Contains(engine.callsWith("remove "), "metis-updater") {
		t.Fatal("a kept component was touched")
	}
	st.Components.Updater = nil
	plan, err = stack.Plan(ctx, st, Options{Keep: []string{"updater"}})
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(plan.Remove, "metis-updater") {
		t.Fatalf("a kept component is planned for removal: %+v", plan)
	}
}

func TestPreflightModesAndFailure(t *testing.T) {
	stack, engine := testStack(t)
	ctx := context.Background()
	if _, err := stack.Apply(ctx, testState(), Options{}); err != nil {
		t.Fatal(err)
	}
	engine.calls = nil
	plan, err := stack.Apply(ctx, testState(), Options{Preflight: PreflightAlways, PreflightOverrides: map[string]string{"METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS": "GOOGLE_CLIENT_ID"}})
	if err != nil {
		t.Fatal(err)
	}
	if !plan.Preflight || strings.Join(engine.callsWith("create "), ",") != "metis-preflight" {
		t.Fatalf("plan %+v calls %v", plan, engine.calls)
	}

	writeEnv(t, stack.InstallDir, "SQLD_AUTH_JWT_KEY=jwt\nSQLD_ADMIN_KEY=admin\nBETTER_AUTH_URL=https://changed.example.com\n")
	engine.exitCodes["metis-preflight"] = 1
	engine.logs["metis-preflight"] = "[preflight] Invalid configuration\n"
	engine.calls = nil
	_, err = stack.Apply(ctx, testState(), Options{})
	if err == nil || !strings.Contains(err.Error(), "preflight failed") || !strings.Contains(err.Error(), "Invalid configuration") {
		t.Fatalf("preflight failure: %v", err)
	}
	if slices.Contains(engine.callsWith("create "), "metis-app") {
		t.Fatal("the app was recreated after a failed preflight")
	}
}

func TestPublishedPort(t *testing.T) {
	stack, _ := testStack(t)
	ctx := context.Background()
	if _, err := stack.Apply(ctx, testState(), Options{}); err != nil {
		t.Fatal(err)
	}
	addr, err := stack.PublishedPort(ctx, "metis-sqld", "9090/tcp")
	if err != nil || addr != "127.0.0.1:49153" {
		t.Fatalf("admin port %s %v", addr, err)
	}
}
