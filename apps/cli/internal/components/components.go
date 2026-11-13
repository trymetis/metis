package components

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"

	cerrdefs "github.com/containerd/errdefs"

	"github.com/trymetis/metis/apps/cli/internal/caddy"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

type Options struct {
	Replicas      int
	DataDir       string
	Direct        bool
	UpdaterMode   state.UpdaterMode
	Domain        string
	Purge         bool
	Addresses     []string
	Host          string
	Database      string
	Blobs         string
	Region        string
	DatabaseURL   string
	DatabaseToken string
	Version       string
}

type Component interface {
	Name() string
	Requires() []string
	Validate(st *state.State) error
	Warning(in *Install, adding bool) string
	Add(ctx context.Context, in *Install, opts Options) error
	Remove(ctx context.Context, in *Install, opts Options) error
	Status(ctx context.Context, st *state.State) (string, bool)
}

var registry = []Component{sqldComponent{}, caddyComponent{}, updaterComponent{}, redisComponent{}, workerComponent{}, objstoreComponent{}}

func Register(component Component) {
	registry = append(registry, component)
}

func All() []Component {
	return registry
}

func Get(name string) (Component, error) {
	for _, component := range registry {
		if component.Name() == name {
			return component, nil
		}
	}
	var names []string
	for _, component := range registry {
		names = append(names, component.Name())
	}
	return nil, fmt.Errorf("%s is not a component; the components are %s", name, strings.Join(names, ", "))
}

func Enabled(st *state.State, name string) bool {
	component, err := Get(name)
	if err != nil {
		return false
	}
	_, on := component.Status(context.Background(), st)
	return on
}

func AddWithRequirements(ctx context.Context, in *Install, component Component, opts Options) error {
	for _, name := range component.Requires() {
		if Enabled(in.State, name) {
			continue
		}
		required, err := Get(name)
		if err != nil {
			return err
		}
		if err := required.Validate(in.State); err != nil {
			return fmt.Errorf("%s needs %s: %w", component.Name(), name, err)
		}
		if err := required.Add(ctx, in, Options{}); err != nil {
			return err
		}
		in.Notice("Added %s, which %s needs", name, component.Name())
	}
	if err := component.Validate(in.State); err != nil {
		return err
	}
	return component.Add(ctx, in, opts)
}

func removeFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func isNotFound(err error) bool {
	return cerrdefs.IsNotFound(err)
}

func SetServerEntry(in *Install, key, id string, entry map[string]any) error {
	var list []map[string]any
	if raw := strings.TrimSpace(in.Env.Value(key)); raw != "" {
		if err := json.Unmarshal([]byte(raw), &list); err != nil {
			return fmt.Errorf("%s in .env is not a JSON array: %w", key, err)
		}
	}
	list = slices.DeleteFunc(list, func(existing map[string]any) bool { return existing["id"] == id })
	if entry != nil {
		list = append(list, entry)
	}
	if len(list) == 0 {
		in.Env.Unset(key)
	} else {
		raw, err := json.Marshal(list)
		if err != nil {
			return err
		}
		in.Env.Set(key, string(raw))
	}
	in.Force(key)
	return nil
}

func ServerEntry(in *Install, key, id string) (map[string]any, error) {
	var list []map[string]any
	if raw := strings.TrimSpace(in.Env.Value(key)); raw != "" {
		if err := json.Unmarshal([]byte(raw), &list); err != nil {
			return nil, fmt.Errorf("%s in .env is not a JSON array: %w", key, err)
		}
	}
	for _, entry := range list {
		if entry["id"] == id {
			return entry, nil
		}
	}
	return nil, nil
}

func AppOrigin(in *Install) string {
	parsed, err := url.Parse(in.Env.Value("BETTER_AUTH_URL"))
	if err != nil || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

const (
	StackDatabaseURL       = "http://app.sqld:8080"
	StackMastraDatabaseURL = "http://mastra.sqld:8080"
	StackResendDatabaseURL = "http://resend.sqld:8080"
	RedisURL               = "redis://redis:6379"
)

type sqldComponent struct{}

func (sqldComponent) Name() string                { return "sqld" }
func (sqldComponent) Requires() []string          { return nil }
func (sqldComponent) Validate(*state.State) error { return nil }
func (sqldComponent) Status(_ context.Context, st *state.State) (string, bool) {
	return "namespaces app and mastra", st.Components.Sqld != nil
}

func (sqldComponent) Warning(in *Install, adding bool) string {
	if !adding {
		return ""
	}
	current := in.Env.Value("DATABASE_URL")
	if current == "" || current == StackDatabaseURL {
		return ""
	}
	return fmt.Sprintf("DATABASE_URL is %s. The app moves to an empty database on the server's sqld; nothing is copied from the current one.", current)
}

func (sqldComponent) Add(_ context.Context, in *Install, _ Options) error {
	in.State.Components.Sqld = &state.Sqld{}
	env := in.Env
	if env.Value("SQLD_ADMIN_KEY") == "" {
		env.Set("SQLD_ADMIN_KEY", secrets.Token())
	}
	if env.Value("SQLD_AUTH_JWT_KEY") == "" || env.Value("DATABASE_URL") != StackDatabaseURL {
		auth, err := secrets.NewSqldAuth()
		if err != nil {
			return err
		}
		env.Set("SQLD_AUTH_JWT_KEY", auth.JWTKey)
		env.Set("DATABASE_AUTH_TOKEN", auth.Token)
		env.Set("MASTRA_DATABASE_AUTH_TOKEN", auth.Token)
	}
	env.Set("METIS_DB_DRIVER", "sqld")
	env.Set("DATABASE_URL", StackDatabaseURL)
	env.Set("MASTRA_DATABASE_URL", StackMastraDatabaseURL)
	return nil
}

func (sqldComponent) Remove(_ context.Context, in *Install, opts Options) error {
	purge := opts.Purge
	var users []string
	for _, key := range []string{"DATABASE_URL", "MASTRA_DATABASE_URL"} {
		if strings.HasSuffix(in.Env.Value(key), ".sqld:8080") {
			users = append(users, key)
		}
	}
	if resend := in.State.Components.GatewayResend; resend != nil && resend.Database == "stack" {
		users = append(users, "gateway-resend --database stack")
	}
	if len(users) > 0 {
		return fmt.Errorf("sqld is in use by %s; move the app's databases with sudo metis db move, or point them at another database first", strings.Join(users, ", "))
	}
	in.State.Components.Sqld = nil
	in.Env.Unset("SQLD_AUTH_JWT_KEY")
	in.Env.Unset("SQLD_ADMIN_KEY")
	if purge {
		in.Purge = append(in.Purge, "metis-sqld")
	}
	return nil
}

type caddyComponent struct{}

func (caddyComponent) Name() string       { return "caddy" }
func (caddyComponent) Requires() []string { return nil }
func (caddyComponent) Validate(*state.State) error {
	return nil
}
func (caddyComponent) Warning(*Install, bool) string { return "" }
func (caddyComponent) Status(_ context.Context, st *state.State) (string, bool) {
	if st.Components.Caddy == nil {
		return "", false
	}
	return "serving " + strings.Join(caddy.Hosts(st), ", "), true
}

func (caddyComponent) Add(ctx context.Context, in *Install, opts Options) error {
	if opts.Domain == "" {
		return errors.New("caddy serves a domain; run metis domain HOST")
	}
	in.State.Components.Caddy = &state.Caddy{Domain: opts.Domain}
	in.Env.Set("METIS_DOMAIN", opts.Domain)
	in.Env.Set("BETTER_AUTH_URL", "https://"+opts.Domain)
	if objstore := in.State.Components.Objstore; objstore != nil && objstore.Direct {
		return objstoreComponent{}.Add(ctx, in, Options{DataDir: objstore.DataDir, Direct: true})
	}
	return nil
}

func (caddyComponent) Remove(_ context.Context, in *Install, opts Options) error {
	purge := opts.Purge
	if objstore := in.State.Components.Objstore; objstore != nil && objstore.Direct {
		return errors.New("objstore --direct serves files from a public host on the domain; run metis add objstore without --direct first")
	}
	if in.State.Components.GatewayResend != nil {
		return errors.New("the Resend gateway needs a public HTTPS address; run metis remove gateway-resend first")
	}
	in.State.Components.Caddy = nil
	in.Env.Unset("METIS_DOMAIN")
	in.Env.Set("BETTER_AUTH_URL", "http://localhost:"+strconv.Itoa(in.State.AppPort))
	if purge {
		in.Purge = append(in.Purge, "metis-caddy-data", "metis-caddy-config")
	}
	return nil
}

type redisComponent struct{}

func (redisComponent) Name() string                  { return "redis" }
func (redisComponent) Requires() []string            { return nil }
func (redisComponent) Validate(*state.State) error   { return nil }
func (redisComponent) Warning(*Install, bool) string { return "" }
func (redisComponent) Status(_ context.Context, st *state.State) (string, bool) {
	return "Valkey, noeviction", st.Components.Redis != nil
}

func (redisComponent) Add(_ context.Context, in *Install, _ Options) error {
	in.State.Components.Redis = &state.Redis{}
	return nil
}

func (redisComponent) Remove(_ context.Context, in *Install, opts Options) error {
	purge := opts.Purge
	if in.State.Components.Worker != nil {
		return errors.New("the workers use redis; run metis remove worker first")
	}
	in.State.Components.Redis = nil
	if purge {
		in.Purge = append(in.Purge, "metis-redis")
	}
	return nil
}

type workerComponent struct{}

const runnerWarning = "This stores the whole workflow runner section from .env, so runner settings changed on the dashboard (cadence, budget, batch size, concurrency, retention) go back to their .env values or defaults."

func (workerComponent) Name() string                { return "worker" }
func (workerComponent) Requires() []string          { return []string{"redis"} }
func (workerComponent) Validate(*state.State) error { return nil }
func (workerComponent) Warning(in *Install, adding bool) string {
	if !adding && in.State.Components.Worker == nil {
		return ""
	}
	return runnerWarning
}
func (workerComponent) Status(_ context.Context, st *state.State) (string, bool) {
	if st.Components.Worker == nil {
		return "", false
	}
	return fmt.Sprintf("%d replica(s), bullmq runner", st.Components.Worker.Replicas), true
}

func (workerComponent) Add(_ context.Context, in *Install, opts Options) error {
	replicas := opts.Replicas
	if replicas < 1 {
		replicas = 1
	}
	in.State.Components.Worker = &state.Worker{Replicas: replicas}
	in.Env.Set("METIS_WORKFLOW_RUNNER_DRIVER", "bullmq")
	in.Env.Set("METIS_WORKFLOW_REDIS_URL", RedisURL)
	in.Force("METIS_WORKFLOW_RUNNER_DRIVER", "METIS_WORKFLOW_REDIS_URL")
	return nil
}

func (workerComponent) Remove(_ context.Context, in *Install, _ Options) error {
	in.State.Components.Worker = nil
	in.Env.Set("METIS_WORKFLOW_RUNNER_DRIVER", "internal")
	in.Env.Unset("METIS_WORKFLOW_REDIS_URL")
	in.Force("METIS_WORKFLOW_RUNNER_DRIVER")
	return nil
}

type objstoreComponent struct{}

const (
	objstoreID      = "metis-objstore"
	DriveBucket     = "drive"
	objstoreEnvFile = "objstore.env"
	s3ServersKey    = "METIS_S3_SERVERS"
)

func (objstoreComponent) Name() string                { return "objstore" }
func (objstoreComponent) Requires() []string          { return nil }
func (objstoreComponent) Validate(*state.State) error { return nil }
func (objstoreComponent) Warning(in *Install, adding bool) string {
	if adding || in.State.Components.Objstore == nil {
		return ""
	}
	return "Drives connected through Server storage are quarantined when the app restarts."
}
func (objstoreComponent) Status(_ context.Context, st *state.State) (string, bool) {
	objstore := st.Components.Objstore
	if objstore == nil {
		return "", false
	}
	parts := []string{"relay transfers"}
	if objstore.Direct {
		parts[0] = "direct transfers through " + caddy.StorageHost(st.Components.Caddy.Domain)
	}
	if objstore.DataDir != "" {
		parts = append(parts, "data in "+objstore.DataDir)
	}
	return strings.Join(parts, ", "), true
}

func (objstoreComponent) Add(_ context.Context, in *Install, opts Options) error {
	if opts.Direct && (in.State.Components.Caddy == nil || in.State.Components.Caddy.Domain == "") {
		return errors.New("--direct serves files from storage. plus the domain; run metis domain HOST first")
	}
	if opts.DataDir != "" {
		if !strings.HasPrefix(opts.DataDir, "/") {
			return fmt.Errorf("--data-dir %s is not an absolute path", opts.DataDir)
		}
		if err := os.MkdirAll(opts.DataDir, 0o700); err != nil {
			return err
		}
	}
	env, err := in.EnvFile(objstoreEnvFile)
	if err != nil {
		return err
	}
	if env.Value("RUSTFS_ACCESS_KEY") == "" {
		env.Set("RUSTFS_ACCESS_KEY", secrets.Hex(10))
		env.Set("RUSTFS_SECRET_KEY", secrets.Token())
	}
	entry := map[string]any{
		"id":              objstoreID,
		"name":            "Server storage",
		"endpoint":        "http://objstore:9000",
		"accessKeyId":     env.Value("RUSTFS_ACCESS_KEY"),
		"secretAccessKey": env.Value("RUSTFS_SECRET_KEY"),
		"forcePathStyle":  true,
		"transfer":        "relay",
	}
	if opts.Direct {
		entry["endpoint"] = "https://" + caddy.StorageHost(in.State.Components.Caddy.Domain)
		entry["transfer"] = "direct"
		env.Set("RUSTFS_CORS_ALLOWED_ORIGINS", AppOrigin(in))
	} else {
		env.Unset("RUSTFS_CORS_ALLOWED_ORIGINS")
	}
	in.State.Components.Objstore = &state.Objstore{DataDir: opts.DataDir, Direct: opts.Direct}
	keyID, secret := env.Value("RUSTFS_ACCESS_KEY"), env.Value("RUSTFS_SECRET_KEY")
	in.After = append(in.After, func(ctx context.Context) error {
		return createBucket(ctx, in, keyID, secret, DriveBucket)
	})
	return SetServerEntry(in, s3ServersKey, objstoreID, entry)
}

func (objstoreComponent) Remove(_ context.Context, in *Install, opts Options) error {
	purge := opts.Purge
	objstore := in.State.Components.Objstore
	in.State.Components.Objstore = nil
	in.RemoveEnvFile(objstoreEnvFile)
	if purge {
		if objstore != nil && objstore.DataDir != "" {
			in.Notice("The data in %s is kept; delete the folder yourself once you no longer need it", objstore.DataDir)
		} else {
			in.Purge = append(in.Purge, "metis-objstore")
		}
	}
	return SetServerEntry(in, s3ServersKey, objstoreID, nil)
}
