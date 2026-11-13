package updater

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect/v2"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/timestamppb"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/version"
)

type fakeBackend struct {
	mu            sync.Mutex
	snapshots     bool
	stored        map[string]bool
	failPreflight bool
	failSwitchTo  string
	notReady      string
	calls         []string
}

func (backend *fakeBackend) record(call string) {
	backend.mu.Lock()
	defer backend.mu.Unlock()
	backend.calls = append(backend.calls, call)
}

func (backend *fakeBackend) Snapshots(*state.State) bool { return backend.snapshots }
func (backend *fakeBackend) Pull(context.Context, Images) error {
	backend.record("pull")
	return nil
}
func (backend *fakeBackend) Preflight(_ context.Context, _ *state.State, images Images) error {
	backend.record("preflight " + ImagesVersion(images))
	if backend.failPreflight {
		return errors.New("exit status 1")
	}
	return nil
}
func (backend *fakeBackend) Switch(_ context.Context, lock *state.Lock, images Images) error {
	target := ImagesVersion(images)
	backend.record("switch " + target)
	if target == backend.failSwitchTo {
		return errors.New("metis-app exited with code 1")
	}
	_, err := lock.Update(func(st *state.State) error {
		st.App = state.App{Version: target, Images: images}
		return nil
	})
	return err
}
func (backend *fakeBackend) StopApp(context.Context) error {
	backend.record("stop app")
	return nil
}
func (backend *fakeBackend) StartApp(context.Context) error {
	backend.record("start app")
	return nil
}
func (backend *fakeBackend) StartSqld(context.Context) error { return nil }
func (backend *fakeBackend) SaveSnapshot(_ context.Context, _ *state.State, name string) error {
	backend.record("save " + name)
	backend.mu.Lock()
	defer backend.mu.Unlock()
	backend.stored[name] = true
	return nil
}
func (backend *fakeBackend) RestoreSnapshot(_ context.Context, _ *state.State, name string) error {
	backend.record("restore " + name)
	return nil
}
func (backend *fakeBackend) HasSnapshot(name string) bool {
	backend.mu.Lock()
	defer backend.mu.Unlock()
	return backend.stored[name]
}
func (backend *fakeBackend) PromoteSnapshot(from, to string) error {
	backend.mu.Lock()
	defer backend.mu.Unlock()
	delete(backend.stored, from)
	backend.stored[to] = true
	return nil
}
func (backend *fakeBackend) DropSnapshot(name string) error {
	backend.mu.Lock()
	defer backend.mu.Unlock()
	delete(backend.stored, name)
	return nil
}
func (backend *fakeBackend) SnapshotDir() string { return "/opt/metis-suite/snapshots" }
func (backend *fakeBackend) WaitReady(_ context.Context, st *state.State) error {
	if backend.notReady != "" && st.App.Version == backend.notReady {
		return errors.New("http://127.0.0.1:3000/api/readyz was not ready within 2m0s (last: answered 503)")
	}
	return nil
}

type fakeReleases []Release

func (releases fakeReleases) List(context.Context, string) ([]Release, error) {
	return releases, nil
}

func (releases fakeReleases) Find(_ context.Context, _, version string) (Release, bool, error) {
	for _, release := range releases {
		if release.Version == version {
			return release, true, nil
		}
	}
	return Release{}, false, nil
}

func setup(t *testing.T, backend *fakeBackend) (*Manager, string) {
	t.Helper()
	dir := t.TempDir()
	st := state.New()
	st.App = state.App{Version: "1.4.0", Images: ReleaseImages("1.4.0")}
	st.Components.Sqld = &state.Sqld{}
	if err := state.Create(dir, st); err != nil {
		t.Fatal(err)
	}
	if backend.stored == nil {
		backend.stored = map[string]bool{}
	}
	releases := fakeReleases{{Version: "1.5.0", MinCli: "0.1.0"}, {Version: "1.4.0"}, {Version: "1.3.0"}, {Version: "2.0.0", MinCli: "99.0.0"}}
	manager, err := NewManager(context.Background(), dir, backend, releases)
	if err != nil {
		t.Fatal(err)
	}
	return manager, dir
}

func wait(t *testing.T, manager *Manager) *updaterv1.Upgrade {
	t.Helper()
	done := make(chan struct{})
	go func() {
		manager.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the upgrade did not finish")
	}
	return manager.Last()
}

func load(t *testing.T, dir string) *state.State {
	t.Helper()
	st, err := state.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return st
}

func TestUpgradeSucceedsAndCanBeUndoneOnce(t *testing.T) {
	backend := &fakeBackend{snapshots: true}
	manager, dir := setup(t, backend)
	ctx := context.Background()
	if _, err := manager.Upgrade(ctx, "1.5.0", "user-1", UpgradeOptions{}); err != nil {
		t.Fatal(err)
	}
	last := wait(t, manager)
	if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED || last.GetRequestedBy() != "user-1" {
		t.Fatalf("upgrade %v", last)
	}
	if got := strings.Join(backend.calls, ","); got != "pull,stop app,save pending,preflight 1.5.0,switch 1.5.0" {
		t.Fatalf("calls %s", got)
	}
	st := load(t, dir)
	if st.App.Version != "1.5.0" || st.Updater.Previous == nil || ImagesVersion(*st.Updater.Previous) != "1.4.0" || st.Updater.SnapshotAt == "" {
		t.Fatalf("state %+v", st)
	}
	status, err := manager.Status(ctx)
	if err != nil || status.GetRollbackVersion() != "1.4.0" || status.GetCurrentVersion() != "1.5.0" {
		t.Fatalf("status %v %v", status, err)
	}

	backend.calls = nil
	if _, err := manager.Rollback("user-1"); err != nil {
		t.Fatal(err)
	}
	last = wait(t, manager)
	if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED || last.GetKind() != updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK {
		t.Fatalf("undo %v", last)
	}
	if got := strings.Join(backend.calls, ","); got != "pull,stop app,restore current,switch 1.4.0" {
		t.Fatalf("undo calls %s", got)
	}
	if st := load(t, dir); st.App.Version != "1.4.0" || st.Updater.Previous != nil {
		t.Fatalf("state after undo %+v", st)
	}
	_, err = manager.Rollback("user-1")
	if connect.CodeOf(err) != connect.CodeFailedPrecondition || !strings.Contains(err.Error(), "there is no upgrade to undo") {
		t.Fatalf("second undo: %v", err)
	}
}

func TestPreflightFailureKeepsTheOldRelease(t *testing.T) {
	backend := &fakeBackend{snapshots: true, failPreflight: true}
	manager, dir := setup(t, backend)
	if _, err := manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{}); err != nil {
		t.Fatal(err)
	}
	last := wait(t, manager)
	if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_FAILED || !last.GetRestored() || !strings.Contains(last.GetError(), "preflight failed") {
		t.Fatalf("upgrade %v", last)
	}
	if st := load(t, dir); st.App.Version != "1.4.0" || st.Updater.Previous != nil {
		t.Fatalf("state %+v", st)
	}
	if backend.HasSnapshot(pendingSnapshot) {
		t.Fatal("the pending snapshot was kept")
	}
}

func TestPreflightFailureWithoutSnapshotsChangesNothing(t *testing.T) {
	backend := &fakeBackend{failPreflight: true}
	manager, dir := setup(t, backend)
	if _, err := manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{}); err != nil {
		t.Fatal(err)
	}
	last := wait(t, manager)
	if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_FAILED || last.GetRestored() || strings.Contains(strings.Join(backend.calls, ","), "stop app") {
		t.Fatalf("upgrade %v calls %v", last, backend.calls)
	}
	if st := load(t, dir); st.App.Version != "1.4.0" {
		t.Fatalf("state %+v", st)
	}
}

func TestSwitchFailureRestores(t *testing.T) {
	backend := &fakeBackend{snapshots: true, failSwitchTo: "1.5.0"}
	manager, dir := setup(t, backend)
	if _, err := manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{}); err != nil {
		t.Fatal(err)
	}
	last := wait(t, manager)
	if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_FAILED || !last.GetRestored() || !strings.Contains(last.GetError(), "switching") {
		t.Fatalf("upgrade %v", last)
	}
	if got := strings.Join(backend.calls, ","); !strings.HasSuffix(got, "switch 1.5.0,stop app,restore pending,switch 1.4.0") {
		t.Fatalf("calls %s", got)
	}
	if st := load(t, dir); st.App.Version != "1.4.0" {
		t.Fatalf("state %+v", st)
	}
}

func TestNoBackupHasNoUndo(t *testing.T) {
	backend := &fakeBackend{snapshots: true}
	manager, dir := setup(t, backend)
	backend.stored[currentSnapshot] = true
	if _, err := manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{NoBackup: true}); err != nil {
		t.Fatal(err)
	}
	if last := wait(t, manager); last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED {
		t.Fatalf("upgrade %v", last)
	}
	if strings.Contains(strings.Join(backend.calls, ","), "save") || backend.HasSnapshot(currentSnapshot) {
		t.Fatalf("calls %v snapshots %v", backend.calls, backend.stored)
	}
	if st := load(t, dir); st.Updater.SnapshotAt != "" {
		t.Fatalf("snapshotAt %q", st.Updater.SnapshotAt)
	}
	if _, err := manager.Rollback(""); connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("undo after --no-backup: %v", err)
	}
}

func TestReleaseNeedingANewerCLIIsRefused(t *testing.T) {
	previous := version.Version
	version.Version = "0.1.0"
	t.Cleanup(func() { version.Version = previous })
	manager, dir := setup(t, &fakeBackend{snapshots: true})
	_, err := manager.Upgrade(context.Background(), "2.0.0", "", UpgradeOptions{})
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Fatalf("upgrade: %v", err)
	}
	var connectErr *connect.Error
	if !errors.As(err, &connectErr) || connectErr.Message() != "This release needs Metis CLI 99.0.0 or later. Run sudo metis self-update on the server, then try again." {
		t.Fatalf("message %v", err)
	}
	if last, _ := lastOf(load(t, dir)); last != nil {
		t.Fatalf("a refused upgrade left a record %v", last)
	}
}

func TestLockHeldByAnotherProcess(t *testing.T) {
	manager, dir := setup(t, &fakeBackend{snapshots: true})
	held, err := state.Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	_, err = manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{})
	if connect.CodeOf(err) != connect.CodeAborted || !strings.Contains(err.Error(), "another metis command") {
		t.Fatalf("upgrade under another command's lock: %v", err)
	}
	if _, err := held.Update(func(st *state.State) error {
		return setLast(st, &updaterv1.Upgrade{State: updaterv1.UpgradeState_UPGRADE_STATE_RUNNING, StartedAt: timestamppb.Now()})
	}); err != nil {
		t.Fatal(err)
	}
	_, err = manager.Upgrade(context.Background(), "1.5.0", "", UpgradeOptions{})
	if connect.CodeOf(err) != connect.CodeAborted || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("upgrade under a running upgrade: %v", err)
	}
	held.Release()
}

func TestDeadRunningRecordIsMarked(t *testing.T) {
	dir := t.TempDir()
	st := state.New()
	st.App = state.App{Version: "1.4.0", Images: ReleaseImages("1.4.0")}
	raw, _ := protojson.Marshal(&updaterv1.Upgrade{Id: "x", State: updaterv1.UpgradeState_UPGRADE_STATE_RUNNING})
	st.Updater.Last = json.RawMessage(raw)
	if err := state.Create(dir, st); err != nil {
		t.Fatal(err)
	}
	manager, err := NewManager(context.Background(), dir, &fakeBackend{stored: map[string]bool{}}, fakeReleases{})
	if err != nil {
		t.Fatal(err)
	}
	if last := manager.Last(); last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED || !strings.Contains(last.GetError(), "stopped while this upgrade was running") {
		t.Fatalf("last %v", last)
	}
}
