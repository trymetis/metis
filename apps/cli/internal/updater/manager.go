package updater

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"connectrpc.com/connect/v2"
	"golang.org/x/mod/semver"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

const (
	pendingSnapshot = "pending"
	currentSnapshot = "current"
)

type ReleaseSource interface {
	List(ctx context.Context, current string) ([]Release, error)
	Find(ctx context.Context, current, version string) (Release, bool, error)
}

type UpgradeOptions struct {
	NoBackup bool
}

type Manager struct {
	dir      string
	backend  Backend
	releases ReleaseSource
	ctx      context.Context

	mu      sync.Mutex
	running bool
	lock    *state.Lock
	last    *updaterv1.Upgrade
	work    sync.WaitGroup
}

func MinCliMessage(minCli string) string {
	return fmt.Sprintf("This release needs Metis CLI %s or later. Run sudo metis self-update on the server, then try again.", minCli)
}

func NewManager(ctx context.Context, dir string, backend Backend, releases ReleaseSource) (*Manager, error) {
	manager := &Manager{dir: dir, backend: backend, releases: releases, ctx: ctx}
	lock, err := state.TryAcquire(dir)
	if errors.Is(err, state.ErrBusy) {
		return manager, nil
	}
	if err != nil {
		return nil, err
	}
	defer lock.Release()
	_, err = lock.Update(func(st *state.State) error {
		last, err := lastOf(st)
		if err != nil || last == nil || last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
			return err
		}
		last.State = updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED
		last.Error = "the updater stopped while this upgrade was running; check which images metis.json pins, that sqld and the app are running (metis status) and the app's health; any database snapshot is in " + backend.SnapshotDir()
		last.FinishedAt = timestamppb.Now()
		return setLast(st, last)
	})
	if err != nil {
		return nil, fmt.Errorf("reading metis.json: %w", err)
	}
	return manager, nil
}

func (manager *Manager) load() (*state.State, error) {
	st, err := state.Load(manager.dir)
	if err != nil {
		return nil, connect.Errorf(connect.CodeInternal, "reading metis.json: %v", err)
	}
	return st, nil
}

func (manager *Manager) Status(ctx context.Context) (*updaterv1.GetStatusResponse, error) {
	st, err := manager.load()
	if err != nil {
		return nil, err
	}
	list, err := manager.releases.List(ctx, st.App.Version)
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnavailable, "listing releases in %s: %v", Repository, err)
	}
	releases := make([]*updaterv1.Release, 0, len(list))
	for _, release := range list {
		releases = append(releases, &updaterv1.Release{Version: release.Version, Notes: release.Notes})
	}
	snapshots := manager.backend.Snapshots(st)
	status := &updaterv1.GetStatusResponse{
		CurrentVersion: st.App.Version,
		Releases:       releases,
		Snapshots:      snapshots,
	}
	if target := manager.undoTarget(st, snapshots); target != "" {
		status.RollbackVersion = target
		if taken, err := time.Parse(time.RFC3339Nano, st.Updater.SnapshotAt); err == nil {
			status.RollbackSnapshotAt = timestamppb.New(taken)
		}
	}
	return status, nil
}

func (manager *Manager) undoTarget(st *state.State, snapshots bool) string {
	last, err := lastOf(st)
	if err != nil || !snapshots || st.Updater.Previous == nil || st.Updater.SnapshotAt == "" || last == nil ||
		last.GetKind() != updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE ||
		last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED ||
		last.GetToVersion() != st.App.Version || !manager.backend.HasSnapshot(currentSnapshot) {
		return ""
	}
	return ImagesVersion(*st.Updater.Previous)
}

func (manager *Manager) Last() *updaterv1.Upgrade {
	manager.mu.Lock()
	if manager.running {
		defer manager.mu.Unlock()
		return proto.CloneOf(manager.last)
	}
	manager.mu.Unlock()
	st, err := state.Load(manager.dir)
	if err != nil {
		log.Printf("[updater] reading metis.json: %v", err)
		return nil
	}
	last, err := lastOf(st)
	if err != nil {
		log.Printf("[updater] reading the last upgrade from metis.json: %v", err)
		return nil
	}
	return last
}

func (manager *Manager) Wait() {
	manager.work.Wait()
}

func newID() string {
	bytes := make([]byte, 8)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (manager *Manager) Upgrade(ctx context.Context, version, requestedBy string, opts UpgradeOptions) (*updaterv1.Upgrade, error) {
	if !IsReleaseVersion(version) {
		return nil, connect.Errorf(connect.CodeInvalidArgument, "%q is not a release version such as 1.4.0", version)
	}
	st, err := manager.load()
	if err != nil {
		return nil, err
	}
	release, published, err := manager.releases.Find(ctx, st.App.Version, version)
	if err != nil {
		return nil, connect.Errorf(connect.CodeUnavailable, "listing releases in %s: %v", Repository, err)
	}
	if !published {
		return nil, connect.Errorf(connect.CodeNotFound, "%s is not a published release", version)
	}
	if release.MinCli != "" && !CLISatisfies(release.MinCli) {
		return nil, connect.NewError(connect.CodeFailedPrecondition, MinCliMessage(release.MinCli))
	}
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE, requestedBy, opts.NoBackup, func(st *state.State, _ bool) (Images, error) {
		current := st.App.Version
		if current != "" && current != version && semver.Compare("v"+version, "v"+current) < 0 {
			return Images{}, connect.Errorf(connect.CodeFailedPrecondition, "%s is older than the running %s; only newer releases can be installed", version, current)
		}
		return ReleaseImages(version), nil
	})
}

func (manager *Manager) Rollback(requestedBy string) (*updaterv1.Upgrade, error) {
	return manager.start(updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK, requestedBy, false, func(st *state.State, snapshots bool) (Images, error) {
		if manager.undoTarget(st, snapshots) == "" {
			return Images{}, connect.NewError(connect.CodeFailedPrecondition, "there is no upgrade to undo")
		}
		return *st.Updater.Previous, nil
	})
}

func (manager *Manager) acquire() (*state.Lock, error) {
	lock, err := state.TryAcquire(manager.dir)
	if errors.Is(err, state.ErrBusy) {
		if st, loadErr := state.Load(manager.dir); loadErr == nil {
			if _, running := st.RunningUpgradeStart(); running {
				return nil, connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
			}
		}
		return nil, connect.NewError(connect.CodeAborted, "another metis command is changing this install; try again in a moment")
	}
	if err != nil {
		return nil, connect.Errorf(connect.CodeInternal, "%v", err)
	}
	return lock, nil
}

func (manager *Manager) start(kind updaterv1.UpgradeKind, requestedBy string, noBackup bool, target func(st *state.State, snapshots bool) (Images, error)) (*updaterv1.Upgrade, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.running {
		return nil, connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
	}
	lock, err := manager.acquire()
	if err != nil {
		return nil, err
	}
	st, err := manager.load()
	if err != nil {
		lock.Release()
		return nil, err
	}
	snapshots := manager.backend.Snapshots(st)
	to, err := target(st, snapshots)
	if err != nil {
		lock.Release()
		return nil, err
	}
	version := ImagesVersion(to)
	if version == st.App.Version {
		lock.Release()
		return nil, connect.Errorf(connect.CodeAlreadyExists, "%s is already running", version)
	}
	from := st.App.Images
	upgrade := &updaterv1.Upgrade{
		Id:          newID(),
		Kind:        kind,
		FromVersion: st.App.Version,
		ToVersion:   version,
		State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
		Step:        updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
		StartedAt:   timestamppb.Now(),
		RequestedBy: requestedBy,
	}
	manager.last = upgrade
	manager.lock = lock
	manager.running = true
	manager.saveLocked(nil)
	log.Printf("[updater] %s %s → %s started (%s)", kind, displayVersion(st.App.Version), version, upgrade.GetId())

	manager.work.Add(1)
	if kind == updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK {
		go manager.undo(to)
	} else {
		go manager.upgrade(from, to, snapshots && !noBackup)
	}
	return proto.CloneOf(upgrade), nil
}

func displayVersion(version string) string {
	if version == "" {
		return "unpinned"
	}
	return version
}

func (manager *Manager) saveLocked(update func(*state.State)) {
	_, err := manager.lock.Update(func(st *state.State) error {
		if update != nil {
			update(st)
		}
		return setLast(st, manager.last)
	})
	if err != nil {
		log.Printf("[updater] saving metis.json failed: %v", err)
	}
}

func (manager *Manager) step(step updaterv1.UpgradeStep) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.last.Step = step
	manager.saveLocked(nil)
}

func (manager *Manager) finish(result updaterv1.UpgradeState, restored bool, err error, update func(*state.State)) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	defer manager.work.Done()
	last := manager.last
	last.State = result
	last.Restored = restored
	if err != nil {
		last.Error = err.Error()
	}
	last.FinishedAt = timestamppb.Now()
	manager.saveLocked(update)
	manager.lock.Release()
	manager.lock = nil
	manager.running = false
	if err != nil {
		log.Printf("[updater] %s %s (%s): %v", last.GetKind(), result, last.GetId(), err)
		return
	}
	log.Printf("[updater] %s %s (%s)", last.GetKind(), result, last.GetId())
}

func (manager *Manager) current() *state.State {
	st, err := state.Load(manager.dir)
	if err != nil {
		log.Printf("[updater] reading metis.json: %v", err)
		return state.New()
	}
	return st
}

func (manager *Manager) upgrade(from, to Images, snapshots bool) {
	ctx := manager.ctx
	if err := manager.backend.Pull(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("pulling %s: %w", to.App, err), nil)
		return
	}

	var takenAt time.Time
	if snapshots {
		manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SNAPSHOT)
		takenAt = time.Now()
		if err := manager.takeSnapshot(ctx); err != nil {
			manager.resume(ctx, from, fmt.Errorf("taking the database snapshot: %w", err))
			return
		}
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT)
	if err := manager.backend.Preflight(ctx, manager.current(), to); err != nil {
		cause := fmt.Errorf("preflight failed: %w", err)
		if snapshots {
			manager.restore(ctx, from, cause, true)
			return
		}
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, cause, nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH)
	if err := manager.backend.Switch(ctx, manager.lock, to); err != nil {
		manager.restore(ctx, from, fmt.Errorf("switching: %w", err), snapshots)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_READY)
	if err := manager.backend.WaitReady(ctx, manager.current()); err != nil {
		manager.restore(ctx, from, err, snapshots)
		return
	}

	if snapshots {
		if err := manager.backend.PromoteSnapshot(pendingSnapshot, currentSnapshot); err != nil {
			log.Printf("[updater] keeping the database snapshot failed, so this upgrade cannot be undone: %v", err)
			snapshots = false
		}
	} else if err := manager.backend.DropSnapshot(currentSnapshot); err != nil {
		log.Printf("[updater] removing the previous snapshot failed: %v", err)
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED, false, nil, func(st *state.State) {
		previous := from
		st.Updater.Previous = &previous
		st.Updater.SnapshotAt = ""
		if snapshots {
			st.Updater.SnapshotAt = takenAt.UTC().Format(time.RFC3339Nano)
		}
	})
}

func (manager *Manager) takeSnapshot(ctx context.Context) error {
	if err := manager.backend.StopApp(ctx); err != nil {
		return fmt.Errorf("stopping the app: %w", err)
	}
	return manager.backend.SaveSnapshot(ctx, manager.current(), pendingSnapshot)
}

func (manager *Manager) resume(ctx context.Context, from Images, cause error) {
	err := manager.backend.StartSqld(ctx)
	if err == nil {
		err = manager.backend.StartApp(ctx)
	}
	if err == nil {
		err = manager.backend.WaitReady(ctx, manager.current())
	}
	if err != nil {
		manager.finish(
			updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			false,
			fmt.Errorf("%w; starting %s again also failed: %v", cause, displayVersion(ImagesVersion(from)), err),
			nil,
		)
		return
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, cause, nil)
}

func (manager *Manager) restore(ctx context.Context, from Images, cause error, snapshot bool) {
	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE)
	var err error
	if snapshot {
		err = manager.backend.StopApp(ctx)
		if err == nil {
			err = manager.backend.RestoreSnapshot(ctx, manager.current(), pendingSnapshot)
		}
	}
	if err == nil {
		err = manager.backend.Switch(ctx, manager.lock, from)
	}
	if err == nil {
		err = manager.backend.WaitReady(ctx, manager.current())
	}
	if err != nil {
		if snapshot {
			err = fmt.Errorf("%w (the database snapshot is in %s)", err, manager.backend.SnapshotDir()+"/"+pendingSnapshot)
		}
		manager.finish(
			updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			false,
			fmt.Errorf("%w; restoring %s also failed: %v", cause, displayVersion(ImagesVersion(from)), err),
			nil,
		)
		return
	}
	if snapshot {
		if err := manager.backend.DropSnapshot(pendingSnapshot); err != nil {
			log.Printf("[updater] removing the restored snapshot failed: %v", err)
		}
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, true, cause, nil)
}

func (manager *Manager) undo(to Images) {
	ctx := manager.ctx
	if err := manager.backend.Pull(ctx, to); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("pulling %s: %w", to.App, err), nil)
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE)
	if err := manager.backend.StopApp(ctx); err != nil {
		manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_FAILED, false, fmt.Errorf("stopping the app: %w", err), nil)
		return
	}
	if err := manager.backend.RestoreSnapshot(ctx, manager.current(), currentSnapshot); err != nil {
		manager.undoFailed(fmt.Errorf("restoring the database snapshot: %w", err))
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH)
	if err := manager.backend.Switch(ctx, manager.lock, to); err != nil {
		manager.undoFailed(fmt.Errorf("switching: %w", err))
		return
	}

	manager.step(updaterv1.UpgradeStep_UPGRADE_STEP_READY)
	if err := manager.backend.WaitReady(ctx, manager.current()); err != nil {
		manager.undoFailed(err)
		return
	}

	if err := manager.backend.DropSnapshot(currentSnapshot); err != nil {
		log.Printf("[updater] removing the restored snapshot failed: %v", err)
	}
	manager.finish(updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED, false, nil, func(st *state.State) {
		st.Updater.Previous = nil
		st.Updater.SnapshotAt = ""
	})
}

func (manager *Manager) undoFailed(err error) {
	manager.finish(
		updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
		false,
		fmt.Errorf("%w (the database snapshot is in %s)", err, manager.backend.SnapshotDir()+"/"+currentSnapshot),
		nil,
	)
}
