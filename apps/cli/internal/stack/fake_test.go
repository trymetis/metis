package stack

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"iter"
	"strings"
	"sync"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/image"
	"github.com/moby/moby/api/types/jsonstream"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

type fakeContainer struct {
	config  *container.Config
	host    *container.HostConfig
	running bool
	exit    int
}

type fakeEngine struct {
	mu         sync.Mutex
	containers map[string]*fakeContainer
	images     map[string]string
	network    bool
	volumes    map[string]bool
	exitCodes  map[string]int
	logs       map[string]string
	calls      []string
}

func newFakeEngine() *fakeEngine {
	return &fakeEngine{
		containers: map[string]*fakeContainer{},
		images:     map[string]string{},
		volumes:    map[string]bool{},
		exitCodes:  map[string]int{},
		logs:       map[string]string{},
	}
}

func (engine *fakeEngine) record(format string, args ...any) {
	engine.calls = append(engine.calls, fmt.Sprintf(format, args...))
}

func (engine *fakeEngine) callsWith(prefix string) []string {
	var out []string
	for _, call := range engine.calls {
		if strings.HasPrefix(call, prefix) {
			out = append(out, strings.TrimPrefix(call, prefix))
		}
	}
	return out
}

func (engine *fakeEngine) ContainerList(_ context.Context, options client.ContainerListOptions) (client.ContainerListResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	var items []container.Summary
	for name, entry := range engine.containers {
		managed := entry.config.Labels[LabelManaged] == "true"
		if options.Filters != nil && len(options.Filters["label"]) > 0 && !managed {
			continue
		}
		state := container.StateExited
		if entry.running {
			state = container.StateRunning
		}
		items = append(items, container.Summary{ID: name, Names: []string{"/" + name}, Labels: entry.config.Labels, State: state})
	}
	return client.ContainerListResult{Items: items}, nil
}

func (engine *fakeEngine) ContainerInspect(_ context.Context, name string, _ client.ContainerInspectOptions) (client.ContainerInspectResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	entry, ok := engine.containers[name]
	if !ok {
		return client.ContainerInspectResult{}, cerrdefs.ErrNotFound
	}
	state := &container.State{Running: entry.running, ExitCode: entry.exit}
	if entry.config.Healthcheck != nil {
		state.Health = &container.Health{Status: container.Healthy}
	}
	ports := network.PortMap{}
	for port, bindings := range entry.host.PortBindings {
		for _, binding := range bindings {
			if binding.HostPort == "" {
				binding.HostPort = "49153"
			}
			ports[port] = append(ports[port], binding)
		}
	}
	return client.ContainerInspectResult{Container: container.InspectResponse{
		Name:            "/" + name,
		State:           state,
		Config:          entry.config,
		NetworkSettings: &container.NetworkSettings{Ports: ports},
	}}, nil
}

func (engine *fakeEngine) ContainerCreate(_ context.Context, options client.ContainerCreateOptions) (client.ContainerCreateResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if _, ok := engine.containers[options.Name]; ok {
		return client.ContainerCreateResult{}, cerrdefs.ErrConflict
	}
	engine.record("create %s", options.Name)
	engine.containers[options.Name] = &fakeContainer{config: options.Config, host: options.HostConfig}
	return client.ContainerCreateResult{ID: options.Name}, nil
}

func (engine *fakeEngine) ContainerStart(_ context.Context, name string, _ client.ContainerStartOptions) (client.ContainerStartResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	entry, ok := engine.containers[name]
	if !ok {
		return client.ContainerStartResult{}, cerrdefs.ErrNotFound
	}
	engine.record("start %s", name)
	if code, oneShot := engine.exitCodes[name]; oneShot {
		entry.exit = code
		return client.ContainerStartResult{}, nil
	}
	entry.running = true
	return client.ContainerStartResult{}, nil
}

func (engine *fakeEngine) ContainerStop(_ context.Context, name string, _ client.ContainerStopOptions) (client.ContainerStopResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	entry, ok := engine.containers[name]
	if !ok {
		return client.ContainerStopResult{}, cerrdefs.ErrNotFound
	}
	engine.record("stop %s", name)
	entry.running = false
	return client.ContainerStopResult{}, nil
}

func (engine *fakeEngine) ContainerRestart(_ context.Context, name string, _ client.ContainerRestartOptions) (client.ContainerRestartResult, error) {
	engine.record("restart %s", name)
	return client.ContainerRestartResult{}, nil
}

func (engine *fakeEngine) ContainerRemove(_ context.Context, name string, _ client.ContainerRemoveOptions) (client.ContainerRemoveResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if _, ok := engine.containers[name]; !ok {
		return client.ContainerRemoveResult{}, cerrdefs.ErrNotFound
	}
	engine.record("remove %s", name)
	delete(engine.containers, name)
	return client.ContainerRemoveResult{}, nil
}

func (engine *fakeEngine) ContainerWait(_ context.Context, name string, _ client.ContainerWaitOptions) client.ContainerWaitResult {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	results := make(chan container.WaitResponse, 1)
	results <- container.WaitResponse{StatusCode: int64(engine.exitCodes[name])}
	return client.ContainerWaitResult{Result: results, Error: make(chan error)}
}

func frame(text string) []byte {
	header := make([]byte, 8)
	header[0] = 1
	binary.BigEndian.PutUint32(header[4:], uint32(len(text)))
	return append(header, text...)
}

func (engine *fakeEngine) ContainerLogs(_ context.Context, name string, _ client.ContainerLogsOptions) (client.ContainerLogsResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	return io.NopCloser(bytes.NewReader(frame(engine.logs[name]))), nil
}

func (engine *fakeEngine) ImageInspect(_ context.Context, ref string, _ ...client.ImageInspectOption) (client.ImageInspectResult, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	id, ok := engine.images[ref]
	if !ok {
		return client.ImageInspectResult{}, cerrdefs.ErrNotFound
	}
	return client.ImageInspectResult{InspectResponse: image.InspectResponse{ID: id}}, nil
}

type fakePull struct {
	io.ReadCloser
}

func (fakePull) JSONMessages(context.Context) iter.Seq2[jsonstream.Message, error] {
	return func(func(jsonstream.Message, error) bool) {}
}

func (fakePull) Wait(context.Context) error { return nil }

func (engine *fakeEngine) ImagePull(_ context.Context, ref string, _ client.ImagePullOptions) (client.ImagePullResponse, error) {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	engine.record("pull %s", ref)
	engine.images[ref] = "sha256:" + ref
	return fakePull{io.NopCloser(strings.NewReader(""))}, nil
}

func (engine *fakeEngine) NetworkInspect(_ context.Context, _ string, _ client.NetworkInspectOptions) (client.NetworkInspectResult, error) {
	if !engine.network {
		return client.NetworkInspectResult{}, cerrdefs.ErrNotFound
	}
	return client.NetworkInspectResult{}, nil
}

func (engine *fakeEngine) NetworkCreate(_ context.Context, name string, _ client.NetworkCreateOptions) (client.NetworkCreateResult, error) {
	engine.record("network %s", name)
	engine.network = true
	return client.NetworkCreateResult{ID: name}, nil
}

func (engine *fakeEngine) VolumeCreate(_ context.Context, options client.VolumeCreateOptions) (client.VolumeCreateResult, error) {
	engine.volumes[options.Name] = true
	return client.VolumeCreateResult{}, nil
}

func (engine *fakeEngine) VolumeRemove(_ context.Context, name string, _ client.VolumeRemoveOptions) (client.VolumeRemoveResult, error) {
	delete(engine.volumes, name)
	return client.VolumeRemoveResult{}, nil
}

func (engine *fakeEngine) ExecCreate(_ context.Context, name string, options client.ExecCreateOptions) (client.ExecCreateResult, error) {
	engine.record("exec %s %s", name, strings.Join(options.Cmd, " "))
	return client.ExecCreateResult{ID: "exec-" + name}, nil
}

func (engine *fakeEngine) ExecStart(context.Context, string, client.ExecStartOptions) (client.ExecStartResult, error) {
	return client.ExecStartResult{}, nil
}

func (engine *fakeEngine) ExecInspect(context.Context, string, client.ExecInspectOptions) (client.ExecInspectResult, error) {
	return client.ExecInspectResult{}, nil
}
