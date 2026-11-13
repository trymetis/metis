package components

import (
	"context"
	"fmt"
	"path/filepath"
	"slices"
	"strings"

	"github.com/moby/moby/client"

	"github.com/trymetis/metis/apps/cli/internal/caddy"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/sqld"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

const ForceKeysVariable = "METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS"

type Hook func(ctx context.Context) error

type Install struct {
	Stack   *stack.Stack
	Dir     string
	State   *state.State
	Env     *envfile.File
	files   map[string]*envfile.File
	removed []string
	Forced  []string
	Purge   []string
	Notices []string
	Before  []Hook
	After   []Hook
}

func EnvPath(dir string) string {
	return filepath.Join(dir, ".env")
}

func EnvFilePath(dir, name string) string {
	return filepath.Join(dir, "env", name)
}

func NewInstall(dir string, st *state.State) (*Install, error) {
	env, err := envfile.Read(EnvPath(dir))
	if err != nil {
		return nil, err
	}
	return &Install{Dir: dir, State: st, Env: env, files: map[string]*envfile.File{}}, nil
}

func (in *Install) EnvFile(name string) (*envfile.File, error) {
	if file, ok := in.files[name]; ok {
		return file, nil
	}
	file, err := envfile.Read(EnvFilePath(in.Dir, name))
	if err != nil {
		return nil, err
	}
	in.files[name] = file
	in.removed = slices.DeleteFunc(in.removed, func(entry string) bool { return entry == name })
	return file, nil
}

func (in *Install) RemoveEnvFile(name string) {
	delete(in.files, name)
	if !slices.Contains(in.removed, name) {
		in.removed = append(in.removed, name)
	}
}

func (in *Install) Force(keys ...string) {
	for _, key := range keys {
		if !slices.Contains(in.Forced, key) {
			in.Forced = append(in.Forced, key)
		}
	}
}

func (in *Install) Notice(format string, args ...any) {
	in.Notices = append(in.Notices, fmt.Sprintf(format, args...))
}

func (in *Install) save() error {
	if err := in.Env.Write(EnvPath(in.Dir)); err != nil {
		return err
	}
	for name, file := range in.files {
		if err := file.Write(EnvFilePath(in.Dir, name)); err != nil {
			return err
		}
	}
	for _, name := range in.removed {
		if err := removeFile(EnvFilePath(in.Dir, name)); err != nil {
			return err
		}
	}
	return caddy.Write(in.Dir, in.State)
}

type Runner struct {
	Dir   string
	Stack *stack.Stack
}

func (runner *Runner) namespaces(st *state.State, env *envfile.File) Hook {
	return func(ctx context.Context) error {
		if st.Components.Sqld == nil {
			return nil
		}
		addr, err := runner.Stack.PublishedPort(ctx, sqld.Container, sqld.AdminPort)
		if err != nil {
			return err
		}
		names := slices.Clone(sqld.Namespaces)
		if resend := st.Components.GatewayResend; resend != nil && resend.Database == "stack" {
			names = append(names, sqld.ResendNamespace)
		}
		return sqld.CreateNamespaces(ctx, addr, env.Value("SQLD_ADMIN_KEY"), names...)
	}
}

func (runner *Runner) Options(st *state.State, env *envfile.File, forced []string) stack.Options {
	opts := stack.Options{AfterSqld: runner.namespaces(st, env)}
	if len(forced) > 0 {
		opts.Preflight = stack.PreflightAlways
		opts.PreflightOverrides = map[string]string{ForceKeysVariable: strings.Join(forced, ",")}
	}
	return opts
}

func (runner *Runner) Change(ctx context.Context, change func(in *Install) error) (*Install, stack.Plan, error) {
	lock, err := state.Acquire(runner.Dir)
	if err != nil {
		return nil, stack.Plan{}, err
	}
	defer lock.Release()
	st, err := state.Load(runner.Dir)
	if err != nil {
		return nil, stack.Plan{}, err
	}
	in, err := NewInstall(runner.Dir, st)
	if err != nil {
		return nil, stack.Plan{}, err
	}
	in.Stack = runner.Stack
	if err := change(in); err != nil {
		return nil, stack.Plan{}, err
	}
	if err := in.save(); err != nil {
		return nil, stack.Plan{}, err
	}
	if _, err := lock.Update(func(current *state.State) error {
		*current = *in.State
		return nil
	}); err != nil {
		return nil, stack.Plan{}, err
	}
	plan, err := runner.apply(ctx, in)
	return in, plan, err
}

func (runner *Runner) apply(ctx context.Context, in *Install) (stack.Plan, error) {
	for _, hook := range in.Before {
		if err := hook(ctx); err != nil {
			return stack.Plan{}, err
		}
	}
	plan, err := runner.Stack.Apply(ctx, in.State, runner.Options(in.State, in.Env, in.Forced))
	if err != nil {
		return plan, err
	}
	for _, hook := range in.After {
		if err := hook(ctx); err != nil {
			return plan, err
		}
	}
	for _, volume := range in.Purge {
		if _, err := runner.Stack.Engine.VolumeRemove(ctx, volume, client.VolumeRemoveOptions{}); err != nil && !isNotFound(err) {
			return plan, fmt.Errorf("removing volume %s: %w", volume, err)
		}
	}
	return plan, nil
}

func (runner *Runner) First(ctx context.Context, in *Install) (stack.Plan, error) {
	in.Stack = runner.Stack
	if err := in.save(); err != nil {
		return stack.Plan{}, err
	}
	if err := state.Create(runner.Dir, in.State); err != nil {
		return stack.Plan{}, err
	}
	lock, err := state.Acquire(runner.Dir)
	if err != nil {
		return stack.Plan{}, err
	}
	defer lock.Release()
	return runner.apply(ctx, in)
}
