package components

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

func newTestInstall(t *testing.T, env string) *Install {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(env), 0o600); err != nil {
		t.Fatal(err)
	}
	in, err := NewInstall(dir, state.New())
	if err != nil {
		t.Fatal(err)
	}
	return in
}

func get(t *testing.T, name string) Component {
	t.Helper()
	component, err := Get(name)
	if err != nil {
		t.Fatal(err)
	}
	return component
}

func TestWorkerPullsInRedisAndForcesTheRunner(t *testing.T) {
	ctx := context.Background()
	in := newTestInstall(t, "BETTER_AUTH_URL=http://localhost:3000\n")
	if err := AddWithRequirements(ctx, in, get(t, "worker"), Options{Replicas: 3}); err != nil {
		t.Fatal(err)
	}
	if in.State.Components.Redis == nil || in.State.Components.Worker.Replicas != 3 {
		t.Fatalf("components %+v", in.State.Components)
	}
	if in.Env.Value("METIS_WORKFLOW_RUNNER_DRIVER") != "bullmq" || in.Env.Value("METIS_WORKFLOW_REDIS_URL") != RedisURL {
		t.Fatalf("env %v", in.Env.Map())
	}
	if strings.Join(in.Forced, ",") != "METIS_WORKFLOW_RUNNER_DRIVER,METIS_WORKFLOW_REDIS_URL" {
		t.Fatalf("forced %v", in.Forced)
	}
	if err := get(t, "redis").Remove(ctx, in, Options{Purge: false}); err == nil {
		t.Fatal("redis was removed under the workers")
	}
	in.Forced = nil
	if err := get(t, "worker").Remove(ctx, in, Options{Purge: false}); err != nil {
		t.Fatal(err)
	}
	if in.Env.Value("METIS_WORKFLOW_RUNNER_DRIVER") != "internal" || in.Env.Value("METIS_WORKFLOW_REDIS_URL") != "" || strings.Join(in.Forced, ",") != "METIS_WORKFLOW_RUNNER_DRIVER" {
		t.Fatalf("after remove env %v forced %v", in.Env.Map(), in.Forced)
	}
	if err := get(t, "redis").Remove(ctx, in, Options{Purge: true}); err != nil || !slices.Contains(in.Purge, "metis-redis") {
		t.Fatalf("redis remove %v purge %v", err, in.Purge)
	}
}

func TestSqldAddAndGuard(t *testing.T) {
	ctx := context.Background()
	in := newTestInstall(t, "")
	if err := get(t, "sqld").Add(ctx, in, Options{}); err != nil {
		t.Fatal(err)
	}
	env := in.Env
	if env.Value("DATABASE_URL") != StackDatabaseURL || env.Value("MASTRA_DATABASE_URL") != StackMastraDatabaseURL || env.Value("METIS_DB_DRIVER") != "sqld" {
		t.Fatalf("env %v", env.Map())
	}
	if env.Value("DATABASE_AUTH_TOKEN") == "" || env.Value("DATABASE_AUTH_TOKEN") != env.Value("MASTRA_DATABASE_AUTH_TOKEN") || env.Value("SQLD_ADMIN_KEY") == "" {
		t.Fatalf("keys %v", env.Map())
	}
	token := env.Value("DATABASE_AUTH_TOKEN")
	if err := get(t, "sqld").Add(ctx, in, Options{}); err != nil || env.Value("DATABASE_AUTH_TOKEN") != token {
		t.Fatal("adding sqld again replaced its token")
	}
	if err := get(t, "sqld").Remove(ctx, in, Options{Purge: false}); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("remove while in use: %v", err)
	}
	if warning := get(t, "sqld").Warning(newTestInstall(t, "DATABASE_URL=libsql://db.turso.io\n"), true); !strings.Contains(warning, "empty database") {
		t.Fatalf("warning %q", warning)
	}
}

func TestObjstoreEntryKeepsOperatorEntries(t *testing.T) {
	ctx := context.Background()
	in := newTestInstall(t, `BETTER_AUTH_URL=https://mail.example.com
METIS_S3_SERVERS=[{"id":"backblaze","name":"Backblaze","endpoint":"https://s3.example.com","accessKeyId":"a","secretAccessKey":"b"}]
`)
	if err := get(t, "objstore").Add(ctx, in, Options{Direct: true}); err == nil {
		t.Fatal("--direct without a domain")
	}
	if err := get(t, "caddy").Add(ctx, in, Options{Domain: "mail.example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := get(t, "objstore").Add(ctx, in, Options{Direct: true}); err != nil {
		t.Fatal(err)
	}
	var list []map[string]any
	if err := json.Unmarshal([]byte(in.Env.Value("METIS_S3_SERVERS")), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0]["id"] != "backblaze" || list[1]["id"] != "metis-objstore" || list[1]["endpoint"] != "https://storage.mail.example.com" || list[1]["transfer"] != "direct" {
		t.Fatalf("servers %v", list)
	}
	objstoreEnv, _ := in.EnvFile(objstoreEnvFile)
	if list[1]["accessKeyId"] != objstoreEnv.Value("RUSTFS_ACCESS_KEY") || objstoreEnv.Value("RUSTFS_CORS_ALLOWED_ORIGINS") != "https://mail.example.com" {
		t.Fatalf("objstore env %v", objstoreEnv.Map())
	}
	if !slices.Contains(in.Forced, "METIS_S3_SERVERS") {
		t.Fatalf("forced %v", in.Forced)
	}
	if err := get(t, "caddy").Remove(ctx, in, Options{Purge: false}); err == nil {
		t.Fatal("the domain was removed under objstore --direct")
	}
	if err := get(t, "objstore").Remove(ctx, in, Options{Purge: true}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(in.Env.Value("METIS_S3_SERVERS"), "backblaze") || strings.Contains(in.Env.Value("METIS_S3_SERVERS"), "metis-objstore") {
		t.Fatalf("servers after remove %s", in.Env.Value("METIS_S3_SERVERS"))
	}
	if err := get(t, "caddy").Remove(ctx, in, Options{Purge: false}); err != nil {
		t.Fatal(err)
	}
	if in.Env.Value("BETTER_AUTH_URL") != "http://localhost:3000" || in.Env.Value("METIS_DOMAIN") != "" {
		t.Fatalf("env after domain removal %v", in.Env.Map())
	}
}

func TestDomainAndCaddyfile(t *testing.T) {
	in := newTestInstall(t, "")
	if err := get(t, "caddy").Add(context.Background(), in, Options{Domain: "mail.example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := in.save(); err != nil {
		t.Fatal(err)
	}
	caddyfile, err := os.ReadFile(filepath.Join(in.Dir, "Caddyfile"))
	if err != nil || string(caddyfile) != "mail.example.com {\n\treverse_proxy app:3000\n}\n" {
		t.Fatalf("Caddyfile %q %v", caddyfile, err)
	}
	if in.Env.Value("BETTER_AUTH_URL") != "https://mail.example.com" {
		t.Fatalf("env %v", in.Env.Map())
	}
}
