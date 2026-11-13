package updater

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"time"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/client"

	"github.com/trymetis/metis/apps/cli/internal/catalog"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/sqld"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

const (
	readyPollInterval = 2 * time.Second
	readyProbeTimeout = 5 * time.Second
	snapshotsFolder   = "snapshots"
)

type Backend interface {
	Snapshots(st *state.State) bool
	Pull(ctx context.Context, images Images) error
	Preflight(ctx context.Context, st *state.State, images Images) error
	Switch(ctx context.Context, lock *state.Lock, images Images) error
	StopApp(ctx context.Context) error
	StartApp(ctx context.Context) error
	StartSqld(ctx context.Context) error
	SaveSnapshot(ctx context.Context, st *state.State, name string) error
	RestoreSnapshot(ctx context.Context, st *state.State, name string) error
	HasSnapshot(name string) bool
	PromoteSnapshot(from, to string) error
	DropSnapshot(name string) error
	SnapshotDir() string
	WaitReady(ctx context.Context, st *state.State) error
}

type StackBackend struct {
	Stack        *stack.Stack
	ReadyURL     string
	ReadyTimeout time.Duration
}

func (backend *StackBackend) dir() string {
	return backend.Stack.InstallDir
}

func (backend *StackBackend) Snapshots(st *state.State) bool {
	env, err := envfile.Read(components.EnvPath(backend.dir()))
	return err == nil && st.Components.Sqld != nil && env.Value("DATABASE_URL") == components.StackDatabaseURL
}

func (backend *StackBackend) Pull(ctx context.Context, images Images) error {
	return backend.Stack.Pull(ctx, images.App, images.Preflight, images.Worker)
}

func withImages(st *state.State, images Images) *state.State {
	copied := *st
	copied.App = state.App{Version: ImagesVersion(images), Images: images}
	return &copied
}

func (backend *StackBackend) Preflight(ctx context.Context, st *state.State, images Images) error {
	cat, err := backend.Stack.Catalog(ctx, withImages(st, images))
	if err != nil {
		return err
	}
	service, ok := cat.Service("preflight")
	if !ok {
		return fmt.Errorf("the catalog has no preflight service")
	}
	spec, err := stack.BuildSpec(service, 1, cat.Volumes, nil)
	if err != nil {
		return err
	}
	_, err = backend.Stack.RunOnce(ctx, spec)
	return err
}

func appComponents() []string {
	var keep []string
	for _, name := range catalog.Order {
		component := catalog.ComponentOf(name)
		if component != "app" && component != "worker" && !slices.Contains(keep, component) {
			keep = append(keep, component)
		}
	}
	return keep
}

func (backend *StackBackend) Switch(ctx context.Context, lock *state.Lock, images Images) error {
	st, err := lock.Update(func(st *state.State) error {
		st.App = state.App{Version: ImagesVersion(images), Images: images}
		return nil
	})
	if err != nil {
		return fmt.Errorf("writing metis.json: %w", err)
	}
	_, err = backend.Stack.Apply(ctx, st, stack.Options{Preflight: stack.PreflightNever, Keep: appComponents()})
	return err
}

func (backend *StackBackend) appContainers(ctx context.Context) ([]string, error) {
	managed, err := backend.Stack.Managed(ctx)
	if err != nil {
		return nil, err
	}
	var names []string
	for name, summary := range managed {
		component := summary.Labels[stack.LabelComponent]
		if (component == "app" || component == "worker") && name != stack.ContainerName("preflight", 1) {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	return names, nil
}

func (backend *StackBackend) StopApp(ctx context.Context) error {
	names, err := backend.appContainers(ctx)
	if err != nil {
		return err
	}
	for _, name := range names {
		if _, err := backend.Stack.Engine.ContainerStop(ctx, name, client.ContainerStopOptions{}); err != nil {
			return fmt.Errorf("stopping %s: %w", name, err)
		}
	}
	return nil
}

func (backend *StackBackend) StartApp(ctx context.Context) error {
	names, err := backend.appContainers(ctx)
	if err != nil {
		return err
	}
	for _, name := range names {
		if _, err := backend.Stack.Engine.ContainerStart(ctx, name, client.ContainerStartOptions{}); err != nil {
			return fmt.Errorf("starting %s: %w", name, err)
		}
	}
	return nil
}

func (backend *StackBackend) StartSqld(ctx context.Context) error {
	if _, err := backend.Stack.Engine.ContainerStart(ctx, sqld.Container, client.ContainerStartOptions{}); err != nil {
		return fmt.Errorf("starting %s: %w", sqld.Container, err)
	}
	return backend.Stack.Wait(ctx, sqld.Container)
}

func (backend *StackBackend) SnapshotDir() string {
	return filepath.Join(backend.dir(), snapshotsFolder)
}

func (backend *StackBackend) sqldShell(ctx context.Context, st *state.State, script string) error {
	if err := os.MkdirAll(backend.SnapshotDir(), 0o700); err != nil {
		return err
	}
	cat, err := backend.Stack.Catalog(ctx, st)
	if err != nil {
		return err
	}
	service, ok := cat.Service("sqld")
	if !ok {
		return fmt.Errorf("this install runs no sqld")
	}
	spec := stack.Spec{
		Name:    "metis-snapshot",
		Service: "snapshot",
		OneShot: true,
		Config: &container.Config{
			Image:      service.Config.Image,
			User:       "0:0",
			Entrypoint: []string{"/bin/bash", "-c", "set -euo pipefail; " + script},
		},
		Host: &container.HostConfig{
			RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyDisabled},
			NetworkMode:   "none",
			Mounts: []mount.Mount{
				{Type: mount.TypeVolume, Source: cat.Volumes["metis-sqld"], Target: "/var/lib/sqld"},
				{Type: mount.TypeBind, Source: backend.SnapshotDir(), Target: "/snapshot"},
			},
		},
	}
	_, err = backend.Stack.RunOnce(ctx, spec)
	return err
}

func (backend *StackBackend) stopSqld(ctx context.Context) error {
	if _, err := backend.Stack.Engine.ContainerStop(ctx, sqld.Container, client.ContainerStopOptions{}); err != nil {
		return fmt.Errorf("stopping %s: %w", sqld.Container, err)
	}
	return nil
}

func (backend *StackBackend) SaveSnapshot(ctx context.Context, st *state.State, name string) error {
	if err := backend.stopSqld(ctx); err != nil {
		return err
	}
	err := backend.sqldShell(ctx, st, fmt.Sprintf(
		"rm -rf /snapshot/%[1]s; mkdir /snapshot/%[1]s; cp -a /var/lib/sqld/. /snapshot/%[1]s/", name,
	))
	if startErr := backend.StartSqld(ctx); err == nil {
		err = startErr
	}
	return err
}

func (backend *StackBackend) RestoreSnapshot(ctx context.Context, st *state.State, name string) error {
	if err := backend.stopSqld(ctx); err != nil {
		return err
	}
	if err := backend.sqldShell(ctx, st, fmt.Sprintf(
		"test -d /snapshot/%[1]s; shopt -s dotglob; rm -rf /var/lib/sqld/*; cp -a /snapshot/%[1]s/. /var/lib/sqld/", name,
	)); err != nil {
		return err
	}
	return backend.StartSqld(ctx)
}

func (backend *StackBackend) HasSnapshot(name string) bool {
	info, err := os.Stat(filepath.Join(backend.SnapshotDir(), name))
	return err == nil && info.IsDir()
}

func (backend *StackBackend) PromoteSnapshot(from, to string) error {
	target := filepath.Join(backend.SnapshotDir(), to)
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	return os.Rename(filepath.Join(backend.SnapshotDir(), from), target)
}

func (backend *StackBackend) DropSnapshot(name string) error {
	return os.RemoveAll(filepath.Join(backend.SnapshotDir(), name))
}

func (backend *StackBackend) readyURL(st *state.State) string {
	if backend.ReadyURL != "" {
		return backend.ReadyURL
	}
	return "http://127.0.0.1:" + strconv.Itoa(st.AppPort) + "/api/readyz"
}

func (backend *StackBackend) WaitReady(ctx context.Context, st *state.State) error {
	return WaitReady(ctx, backend.readyURL(st), backend.ReadyTimeout)
}

func WaitReady(ctx context.Context, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	httpClient := &http.Client{Timeout: readyProbeTimeout}
	last := "no answer yet"
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		res, err := httpClient.Do(req)
		if err == nil {
			_ = res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
			last = fmt.Sprintf("answered %d", res.StatusCode)
		} else {
			last = err.Error()
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s was not ready within %s (last: %s)", url, timeout, last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(readyPollInterval):
		}
	}
}
