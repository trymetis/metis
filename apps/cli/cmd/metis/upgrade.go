package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"connectrpc.com/connect/v2"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

var stepLabels = map[updaterv1.UpgradeStep]string{
	updaterv1.UpgradeStep_UPGRADE_STEP_PULL:      "Pulling the images",
	updaterv1.UpgradeStep_UPGRADE_STEP_SNAPSHOT:  "Putting the app in maintenance and snapshotting the database",
	updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT: "Running preflight",
	updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH:    "Switching releases",
	updaterv1.UpgradeStep_UPGRADE_STEP_READY:     "Waiting for the app to answer",
	updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE:   "Restoring the previous release",
}

func newManager(ctx context.Context, cfg updater.Config, logf func(string, ...any)) (*updater.Manager, error) {
	engine, err := stack.Connect()
	if err != nil {
		return nil, err
	}
	stk := stack.New(engine, cfg.InstallDir)
	if logf != nil {
		stk.Logf = logf
	}
	backend := &updater.StackBackend{Stack: stk, ReadyURL: cfg.ReadyURL, ReadyTimeout: cfg.ReadyTimeout}
	return updater.NewManager(ctx, cfg.InstallDir, backend, &updater.Releases{TTL: cfg.ReleasesTTL})
}

func runInProcess(parent context.Context, start func(ctx context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error)) error {
	cfg, err := updater.ConfigFromEnv(detected.InstallDir)
	if err != nil {
		return err
	}
	cfg.InstallDir = detected.InstallDir
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)

	manager, err := newManager(ctx, cfg, func(format string, args ...any) { ui.Faint("    "+format, args...) })
	if err != nil {
		return err
	}
	shown := updaterv1.UpgradeStep_UPGRADE_STEP_UNSPECIFIED
	manager.OnStep = func(upgrade *updaterv1.Upgrade) {
		if upgrade.GetStep() == shown {
			return
		}
		if shown == updaterv1.UpgradeStep_UPGRADE_STEP_UNSPECIFIED {
			ui.Heading("%s → %s", displayFrom(upgrade.GetFromVersion()), upgrade.GetToVersion())
		}
		shown = upgrade.GetStep()
		ui.Info("  %s", stepLabels[shown])
	}
	go func() {
		for range signals {
			last := manager.Last()
			if last == nil || last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_RUNNING || last.GetStep() == updaterv1.UpgradeStep_UPGRADE_STEP_PULL {
				ui.Warn("Stopping before anything changed")
				cancel()
				continue
			}
			ui.Warn("The upgrade continues and can no longer be stopped. Follow it with metis status.")
		}
	}()
	upgrade, err := start(ctx, manager)
	if err != nil {
		var connectErr *connect.Error
		if errors.As(err, &connectErr) {
			return errors.New(connectErr.Message())
		}
		return err
	}
	for {
		last := manager.Last()
		if last != nil && last.GetId() == upgrade.GetId() && last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
			manager.Wait()
			return report(last)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func displayFrom(version string) string {
	if version == "" {
		return "unpinned"
	}
	return version
}

func report(last *updaterv1.Upgrade) error {
	switch last.GetState() {
	case updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED:
		ui.Done("Now running %s", last.GetToVersion())
		if warning := last.GetError(); warning != "" {
			ui.Warn("%s.", warning)
		}
		return nil
	case updaterv1.UpgradeState_UPGRADE_STATE_FAILED:
		if last.GetRestored() {
			return fmt.Errorf("%s failed and %s runs again with its database: %s", last.GetToVersion(), last.GetFromVersion(), last.GetError())
		}
		return fmt.Errorf("%s was not installed; %s kept running: %s", last.GetToVersion(), displayFrom(last.GetFromVersion()), last.GetError())
	default:
		return fmt.Errorf("switching back to %s failed too and the install needs attention: %s", displayFrom(last.GetFromVersion()), last.GetError())
	}
}
