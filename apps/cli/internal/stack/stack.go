package stack

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net"
	"slices"
	"strings"
	"time"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"

	"github.com/trymetis/metis/apps/cli/internal/catalog"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

const MaintenanceVariable = "METIS_MAINTENANCE"

const (
	pollEvery   = 2 * time.Second
	waitFor     = 60 * time.Second
	logTailSize = 2000
)

type PreflightMode int

const (
	PreflightAuto PreflightMode = iota
	PreflightAlways
	PreflightNever
)

type Options struct {
	Preflight          PreflightMode
	PreflightOverrides map[string]string
	AfterSqld          func(ctx context.Context) error
	Keep               []string
}

type Plan struct {
	Create    []string
	Recreate  []string
	Remove    []string
	Preflight bool
}

func (plan Plan) Empty() bool {
	return len(plan.Create)+len(plan.Recreate)+len(plan.Remove) == 0 && !plan.Preflight
}

type Stack struct {
	Engine     Engine
	InstallDir string
	Logf       func(format string, args ...any)
}

type desired struct {
	spec Spec
	hash string
}

func New(engine Engine, installDir string) *Stack {
	return &Stack{Engine: engine, InstallDir: installDir, Logf: func(format string, args ...any) {
		log.Printf("[stack] "+format, args...)
	}}
}

func (stack *Stack) dotenv() (map[string]string, error) {
	file, err := envfile.Read(stack.InstallDir + "/.env")
	if err != nil {
		return nil, err
	}
	return file.Map(), nil
}

func (stack *Stack) Catalog(ctx context.Context, st *state.State) (*catalog.Catalog, error) {
	dotenv, err := stack.dotenv()
	if err != nil {
		return nil, err
	}
	return catalog.Load(ctx, st, stack.InstallDir, dotenv)
}

func (stack *Stack) imageID(ctx context.Context, ref string) (string, error) {
	image, err := stack.Engine.ImageInspect(ctx, ref)
	if cerrdefs.IsNotFound(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return image.ID, nil
}

func (stack *Stack) desired(ctx context.Context, cat *catalog.Catalog) ([]desired, Spec, error) {
	var out []desired
	var preflight Spec
	for _, service := range cat.Services {
		for replica := 1; replica <= service.Replicas; replica++ {
			spec, err := BuildSpec(service, replica, cat.Volumes, nil)
			if err != nil {
				return nil, Spec{}, err
			}
			if service.OneShot {
				preflight = spec
				continue
			}
			image, err := stack.imageID(ctx, spec.Config.Image)
			if err != nil {
				return nil, Spec{}, err
			}
			hash, err := Hash(spec, image)
			if err != nil {
				return nil, Spec{}, err
			}
			spec.Config.Labels[LabelSpec] = hash
			out = append(out, desired{spec: spec, hash: hash})
		}
	}
	return out, preflight, nil
}

func (stack *Stack) Managed(ctx context.Context) (map[string]container.Summary, error) {
	list, err := stack.Engine.ContainerList(ctx, client.ContainerListOptions{
		All:     true,
		Filters: client.Filters{}.Add("label", LabelManaged+"=true"),
	})
	if err != nil {
		return nil, err
	}
	out := map[string]container.Summary{}
	for _, item := range list.Items {
		for _, name := range item.Names {
			out[strings.TrimPrefix(name, "/")] = item
		}
	}
	return out, nil
}

func (stack *Stack) plan(want []desired, current map[string]container.Summary, keep []string) Plan {
	var plan Plan
	names := map[string]bool{}
	for _, entry := range want {
		names[entry.spec.Name] = true
		if slices.Contains(keep, entry.spec.Component) {
			continue
		}
		existing, ok := current[entry.spec.Name]
		switch {
		case !ok:
			plan.Create = append(plan.Create, entry.spec.Name)
		case existing.Labels[LabelSpec] != entry.hash:
			plan.Recreate = append(plan.Recreate, entry.spec.Name)
		}
	}
	for name, existing := range current {
		if names[name] || slices.Contains(keep, existing.Labels[LabelComponent]) {
			continue
		}
		plan.Remove = append(plan.Remove, name)
	}
	slices.Sort(plan.Remove)
	plan.Preflight = slices.Contains(plan.Create, ContainerName("app", 1)) || slices.Contains(plan.Recreate, ContainerName("app", 1))
	return plan
}

func (stack *Stack) Plan(ctx context.Context, st *state.State, opts Options) (Plan, error) {
	cat, err := stack.Catalog(ctx, st)
	if err != nil {
		return Plan{}, err
	}
	want, _, err := stack.desired(ctx, cat)
	if err != nil {
		return Plan{}, err
	}
	current, err := stack.Managed(ctx)
	if err != nil {
		return Plan{}, err
	}
	plan := stack.plan(want, current, opts.Keep)
	plan.Preflight = preflightNeeded(plan, opts.Preflight)
	return plan, nil
}

func preflightNeeded(plan Plan, mode PreflightMode) bool {
	switch mode {
	case PreflightAlways:
		return true
	case PreflightNever:
		return false
	}
	return plan.Preflight
}

func (stack *Stack) ensureNetwork(ctx context.Context) error {
	_, err := stack.Engine.NetworkInspect(ctx, catalog.Network, client.NetworkInspectOptions{})
	if err == nil {
		return nil
	}
	if !cerrdefs.IsNotFound(err) {
		return err
	}
	_, err = stack.Engine.NetworkCreate(ctx, catalog.Network, client.NetworkCreateOptions{
		Driver: "bridge",
		Labels: map[string]string{LabelManaged: "true"},
	})
	return err
}

func (stack *Stack) ensureVolumes(ctx context.Context, cat *catalog.Catalog) error {
	seen := map[string]bool{}
	for _, service := range cat.Services {
		for _, volume := range service.Config.Volumes {
			name, ok := cat.Volumes[volume.Source]
			if volume.Type != "volume" || !ok || seen[name] {
				continue
			}
			seen[name] = true
			if _, err := stack.Engine.VolumeCreate(ctx, client.VolumeCreateOptions{
				Name:   name,
				Labels: map[string]string{LabelManaged: "true"},
			}); err != nil {
				return fmt.Errorf("creating volume %s: %w", name, err)
			}
		}
	}
	return nil
}

func (stack *Stack) Pull(ctx context.Context, refs ...string) error {
	for _, ref := range refs {
		id, err := stack.imageID(ctx, ref)
		if err != nil {
			return err
		}
		if id != "" {
			continue
		}
		stack.Logf("pulling %s", ref)
		response, err := stack.Engine.ImagePull(ctx, ref, client.ImagePullOptions{})
		if err != nil {
			return fmt.Errorf("pulling %s: %w", ref, err)
		}
		if err := response.Wait(ctx); err != nil {
			return fmt.Errorf("pulling %s: %w", ref, err)
		}
	}
	return nil
}

func images(cat *catalog.Catalog) []string {
	var refs []string
	for _, service := range cat.Services {
		if !slices.Contains(refs, service.Config.Image) {
			refs = append(refs, service.Config.Image)
		}
	}
	return refs
}

func (stack *Stack) Apply(ctx context.Context, st *state.State, opts Options) (Plan, error) {
	cat, err := stack.Catalog(ctx, st)
	if err != nil {
		return Plan{}, err
	}
	if err := stack.ensureNetwork(ctx); err != nil {
		return Plan{}, fmt.Errorf("creating network %s: %w", catalog.Network, err)
	}
	if err := stack.ensureVolumes(ctx, cat); err != nil {
		return Plan{}, err
	}
	if err := stack.Pull(ctx, images(cat)...); err != nil {
		return Plan{}, err
	}
	want, preflight, err := stack.desired(ctx, cat)
	if err != nil {
		return Plan{}, err
	}
	current, err := stack.Managed(ctx)
	if err != nil {
		return Plan{}, err
	}
	plan := stack.plan(want, current, opts.Keep)
	plan.Preflight = preflightNeeded(plan, opts.Preflight)

	afterSqld := false
	runAfterSqld := func() error {
		if afterSqld || opts.AfterSqld == nil {
			return nil
		}
		afterSqld = true
		return opts.AfterSqld(ctx)
	}
	for _, entry := range want {
		if entry.spec.Service != "sqld" && entry.spec.Service != "sqld-resend" {
			if err := runAfterSqld(); err != nil {
				return plan, err
			}
		}
		if entry.spec.Service == "app" && plan.Preflight {
			if err := stack.runPreflight(ctx, preflight, opts.PreflightOverrides); err != nil {
				return plan, err
			}
		}
		if slices.Contains(opts.Keep, entry.spec.Component) {
			continue
		}
		if err := stack.ensure(ctx, entry, current); err != nil {
			return plan, err
		}
	}
	if err := runAfterSqld(); err != nil {
		return plan, err
	}
	for _, name := range plan.Remove {
		if err := stack.remove(ctx, name); err != nil {
			return plan, err
		}
	}
	return plan, nil
}

func (stack *Stack) Maintenance(ctx context.Context, st *state.State, on bool) error {
	cat, err := stack.Catalog(ctx, st)
	if err != nil {
		return err
	}
	current, err := stack.Managed(ctx)
	if err != nil {
		return err
	}
	var overrides map[string]string
	if on {
		overrides = map[string]string{MaintenanceVariable: time.Now().UTC().Format(time.RFC3339)}
		stack.Logf("putting the app in maintenance")
	} else {
		stack.Logf("taking the app out of maintenance")
	}
	for _, service := range cat.Services {
		if service.OneShot || (service.Component != "app" && service.Component != "worker") {
			continue
		}
		for replica := 1; replica <= service.Replicas; replica++ {
			spec, err := BuildSpec(service, replica, cat.Volumes, overrides)
			if err != nil {
				return err
			}
			image, err := stack.imageID(ctx, spec.Config.Image)
			if err != nil {
				return err
			}
			hash, err := Hash(spec, image)
			if err != nil {
				return err
			}
			spec.Config.Labels[LabelSpec] = hash
			if err := stack.ensure(ctx, desired{spec: spec, hash: hash}, current); err != nil {
				return err
			}
		}
	}
	return nil
}

func (stack *Stack) runPreflight(ctx context.Context, spec Spec, overrides map[string]string) error {
	if len(overrides) > 0 {
		env := slices.Clone(spec.Config.Env)
		for key, value := range overrides {
			env = slices.DeleteFunc(env, func(entry string) bool { return strings.HasPrefix(entry, key+"=") })
			env = append(env, key+"="+value)
		}
		config := *spec.Config
		config.Env = env
		spec.Config = &config
	}
	stack.Logf("running preflight")
	if _, err := stack.RunOnce(ctx, spec); err != nil {
		return fmt.Errorf("preflight failed: %w", err)
	}
	return nil
}

func (stack *Stack) ensure(ctx context.Context, entry desired, current map[string]container.Summary) error {
	name := entry.spec.Name
	existing, ok := current[name]
	if ok && existing.Labels[LabelSpec] != entry.hash {
		if err := stack.remove(ctx, name); err != nil {
			return err
		}
		ok = false
	}
	if !ok {
		stack.Logf("creating %s", name)
		if _, err := stack.Engine.ContainerCreate(ctx, client.ContainerCreateOptions{
			Name:             name,
			Config:           entry.spec.Config,
			HostConfig:       entry.spec.Host,
			NetworkingConfig: entry.spec.Network,
		}); err != nil {
			return fmt.Errorf("creating %s: %w", name, err)
		}
	} else if entry.spec.Service == "caddy" && existing.State == container.StateRunning {
		if err := stack.Exec(ctx, name, "caddy", "reload", "--config", "/etc/caddy/Caddyfile"); err != nil {
			return fmt.Errorf("reloading caddy: %w", err)
		}
	}
	if !ok || existing.State != container.StateRunning {
		if _, err := stack.Engine.ContainerStart(ctx, name, client.ContainerStartOptions{}); err != nil {
			return fmt.Errorf("starting %s: %w", name, err)
		}
	}
	return stack.Wait(ctx, name)
}

func (stack *Stack) remove(ctx context.Context, name string) error {
	stack.Logf("removing %s", name)
	if _, err := stack.Engine.ContainerStop(ctx, name, client.ContainerStopOptions{}); err != nil && !cerrdefs.IsNotFound(err) {
		return fmt.Errorf("stopping %s: %w", name, err)
	}
	if _, err := stack.Engine.ContainerRemove(ctx, name, client.ContainerRemoveOptions{}); err != nil && !cerrdefs.IsNotFound(err) {
		return fmt.Errorf("removing %s: %w", name, err)
	}
	return nil
}

func (stack *Stack) Wait(ctx context.Context, name string) error {
	deadline := time.Now().Add(waitFor)
	for {
		inspect, err := stack.Engine.ContainerInspect(ctx, name, client.ContainerInspectOptions{})
		if err != nil {
			return err
		}
		state := inspect.Container.State
		if state == nil {
			return fmt.Errorf("%s has no state", name)
		}
		if !state.Running {
			return fmt.Errorf("%s exited with code %d%s", name, state.ExitCode, stack.logTail(ctx, name))
		}
		if state.Health == nil || state.Health.Status == container.Healthy {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s was not healthy within %s (%s)%s", name, waitFor, state.Health.Status, stack.logTail(ctx, name))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pollEvery):
		}
	}
}

func (stack *Stack) logTail(ctx context.Context, name string) string {
	logs, err := stack.Logs(ctx, name, "200")
	if err != nil || logs == "" {
		return ""
	}
	if len(logs) > logTailSize {
		logs = logs[len(logs)-logTailSize:]
	}
	return ":\n" + strings.TrimRight(logs, "\n")
}

func (stack *Stack) Logs(ctx context.Context, name, tail string) (string, error) {
	reader, err := stack.Engine.ContainerLogs(ctx, name, client.ContainerLogsOptions{ShowStdout: true, ShowStderr: true, Tail: tail})
	if err != nil {
		return "", err
	}
	defer reader.Close()
	var out bytes.Buffer
	if _, err := stdcopy.StdCopy(&out, &out, reader); err != nil {
		return out.String(), err
	}
	return out.String(), nil
}

func (stack *Stack) RunOnce(ctx context.Context, spec Spec) (string, error) {
	name := spec.Name
	if _, err := stack.Engine.ContainerRemove(ctx, name, client.ContainerRemoveOptions{Force: true}); err != nil && !cerrdefs.IsNotFound(err) {
		return "", fmt.Errorf("removing a leftover %s: %w", name, err)
	}
	if err := stack.Pull(ctx, spec.Config.Image); err != nil {
		return "", err
	}
	if _, err := stack.Engine.ContainerCreate(ctx, client.ContainerCreateOptions{
		Name:             name,
		Config:           spec.Config,
		HostConfig:       spec.Host,
		NetworkingConfig: spec.Network,
	}); err != nil {
		return "", fmt.Errorf("creating %s: %w", name, err)
	}
	defer func() {
		_, _ = stack.Engine.ContainerRemove(context.WithoutCancel(ctx), name, client.ContainerRemoveOptions{Force: true})
	}()
	wait := stack.Engine.ContainerWait(ctx, name, client.ContainerWaitOptions{Condition: container.WaitConditionNextExit})
	if _, err := stack.Engine.ContainerStart(ctx, name, client.ContainerStartOptions{}); err != nil {
		return "", fmt.Errorf("starting %s: %w", name, err)
	}
	var code int64
	select {
	case result := <-wait.Result:
		code = result.StatusCode
		if result.Error != nil && result.Error.Message != "" {
			return "", fmt.Errorf("%s: %s", name, result.Error.Message)
		}
	case err := <-wait.Error:
		return "", fmt.Errorf("waiting for %s: %w", name, err)
	}
	logs, _ := stack.Logs(ctx, name, "all")
	if code != 0 {
		tail := logs
		if len(tail) > logTailSize {
			tail = tail[len(tail)-logTailSize:]
		}
		return logs, fmt.Errorf("%s exited with code %d:\n%s", name, code, strings.TrimRight(tail, "\n"))
	}
	return logs, nil
}

func (stack *Stack) Exec(ctx context.Context, name string, cmd ...string) error {
	created, err := stack.Engine.ExecCreate(ctx, name, client.ExecCreateOptions{Cmd: cmd})
	if err != nil {
		return err
	}
	if _, err := stack.Engine.ExecStart(ctx, created.ID, client.ExecStartOptions{Detach: true}); err != nil {
		return err
	}
	deadline := time.Now().Add(waitFor)
	for {
		inspect, err := stack.Engine.ExecInspect(ctx, created.ID, client.ExecInspectOptions{})
		if err != nil {
			return err
		}
		if !inspect.Running {
			if inspect.ExitCode != 0 {
				return fmt.Errorf("%s exited with code %d", strings.Join(cmd, " "), inspect.ExitCode)
			}
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s did not finish within %s", strings.Join(cmd, " "), waitFor)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (stack *Stack) PublishedPort(ctx context.Context, name, port string) (string, error) {
	inspect, err := stack.Engine.ContainerInspect(ctx, name, client.ContainerInspectOptions{})
	if err != nil {
		return "", err
	}
	key, err := network.ParsePort(port)
	if err != nil {
		return "", err
	}
	if inspect.Container.NetworkSettings == nil {
		return "", fmt.Errorf("%s publishes no ports", name)
	}
	for _, binding := range inspect.Container.NetworkSettings.Ports[key] {
		if binding.HostPort == "" {
			continue
		}
		host := "127.0.0.1"
		if binding.HostIP.IsValid() && !binding.HostIP.IsUnspecified() {
			host = binding.HostIP.String()
		}
		return net.JoinHostPort(host, binding.HostPort), nil
	}
	return "", fmt.Errorf("%s does not publish %s", name, port)
}
