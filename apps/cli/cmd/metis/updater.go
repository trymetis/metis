package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	"github.com/spf13/cobra"
	"golang.org/x/mod/semver"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/gen/metis/updater/v1/updaterv1connect"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

const updaterShutdownGrace = 5 * time.Second

func listenUnix(path string) (net.Listener, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		_ = listener.Close()
		return nil, err
	}
	return listener, nil
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

type serveFlags struct {
	socket       string
	readyTimeout time.Duration
	releasesTTL  time.Duration
}

func serveUpdater(parent context.Context, flags serveFlags, changed func(string) bool) error {
	installDir := ""
	if detectedMode, err := mode.Detect(); err == nil && detectedMode.Mode == mode.Server {
		installDir = detectedMode.InstallDir
	}
	cfg, err := updater.ConfigFromEnv(installDir)
	if err != nil {
		return err
	}
	if cfg.InstallDir == "" {
		return fmt.Errorf("%s does not exist and METIS_INSTALL_DIR is not set", mode.InstallDirFile)
	}
	if changed("socket") {
		cfg.SocketPath = flags.socket
	}
	if changed("ready-timeout") {
		cfg.ReadyTimeout = flags.readyTimeout
	}
	if changed("releases-ttl") {
		cfg.ReleasesTTL = flags.releasesTTL
	}
	st, err := state.Load(cfg.InstallDir)
	if err != nil {
		return err
	}
	if cfg.ReadyURL == "" && st.Components.Updater != nil && st.Components.Updater.Mode == state.UpdaterDocker {
		cfg.ReadyURL = "http://app:3000/api/readyz"
	}

	ctx, stop := signal.NotifyContext(parent, syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	manager, err := newManager(context.WithoutCancel(ctx), cfg, nil)
	if err != nil {
		return err
	}

	server := connect.NewServer()
	updaterv1connect.RegisterUpdaterServiceHandler(server, updater.NewService(manager))
	mux := http.NewServeMux()
	connecthttp.Mount(mux, server)

	listener, err := listenUnix(cfg.SocketPath)
	if err != nil {
		return err
	}
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{
		Handler:           mux,
		Protocols:         protocols,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), updaterShutdownGrace)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Printf("[updater] serving on %s for %s", cfg.SocketPath, cfg.InstallDir)
	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func newUpdaterCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "updater",
		Short:  "The updater daemon",
		Hidden: true,
	}
	flags := serveFlags{}
	serve := &cobra.Command{
		Use:   "serve",
		Short: "Serve the updater protocol on its socket",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return serveUpdater(cmd.Context(), flags, func(name string) bool { return cmd.Flags().Changed(name) })
		},
	}
	serve.Flags().StringVar(&flags.socket, "socket", updater.DefaultSocket, "the Unix socket to serve on (METIS_UPDATER_SOCKET)")
	serve.Flags().DurationVar(&flags.readyTimeout, "ready-timeout", 2*time.Minute, "how long a new release has to answer /api/readyz (METIS_UPDATER_READY_TIMEOUT)")
	serve.Flags().DurationVar(&flags.releasesTTL, "releases-ttl", 5*time.Minute, "how long the release list is cached (METIS_UPDATER_RELEASES_TTL)")
	cmd.AddCommand(serve)
	return cmd
}

var stepLabels = map[updaterv1.UpgradeStep]string{
	updaterv1.UpgradeStep_UPGRADE_STEP_PULL:      "Pulling the images",
	updaterv1.UpgradeStep_UPGRADE_STEP_SNAPSHOT:  "Stopping the app and snapshotting the database",
	updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT: "Running preflight",
	updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH:    "Switching releases",
	updaterv1.UpgradeStep_UPGRADE_STEP_READY:     "Waiting for the app to answer",
	updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE:   "Restoring the previous release",
}

func runInProcess(parent context.Context, start func(ctx context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error)) error {
	cfg, err := updater.ConfigFromEnv(detected.InstallDir)
	if err != nil {
		return err
	}
	cfg.InstallDir = detected.InstallDir
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	var step atomic.Int32
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGHUP)
	defer signal.Stop(signals)
	go func() {
		for range signals {
			if updaterv1.UpgradeStep(step.Load()) == updaterv1.UpgradeStep_UPGRADE_STEP_PULL {
				ui.Warn("Stopping before anything changed")
				cancel()
				continue
			}
			ui.Warn("The upgrade continues: stopping now would leave the app down. Follow it with metis status.")
		}
	}()

	manager, err := newManager(ctx, cfg, func(format string, args ...any) { ui.Faint("    "+format, args...) })
	if err != nil {
		return err
	}
	upgrade, err := start(ctx, manager)
	if err != nil {
		var connectErr *connect.Error
		if errors.As(err, &connectErr) {
			return errors.New(connectErr.Message())
		}
		return err
	}
	ui.Heading("%s → %s", displayFrom(upgrade.GetFromVersion()), upgrade.GetToVersion())
	shown := updaterv1.UpgradeStep_UPGRADE_STEP_UNSPECIFIED
	for {
		last := manager.Last()
		if last != nil && last.GetId() == upgrade.GetId() {
			step.Store(int32(last.GetStep()))
			if last.GetStep() != shown {
				shown = last.GetStep()
				ui.Info("  %s", stepLabels[shown])
			}
			if last.GetState() != updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
				manager.Wait()
				return report(last)
			}
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

func newUpdateCommand() *cobra.Command {
	noBackup := false
	cmd := &cobra.Command{
		Use:   "update [VERSION]",
		Short: "Upgrade to the newest release, or VERSION",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runInProcess(cmd.Context(), func(ctx context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error) {
				target := ""
				if len(args) == 1 {
					target = strings.TrimPrefix(args[0], "v")
				} else {
					status, err := manager.Status(ctx)
					if err != nil {
						return nil, err
					}
					for _, release := range status.GetReleases() {
						if status.GetCurrentVersion() == "" || semver.Compare("v"+release.GetVersion(), "v"+status.GetCurrentVersion()) > 0 {
							target = release.GetVersion()
							break
						}
					}
					if target == "" {
						return nil, fmt.Errorf("%s is the newest release", status.GetCurrentVersion())
					}
				}
				if noBackup {
					ui.Warn("--no-backup takes no database snapshot, so this upgrade cannot be undone")
				}
				return manager.Upgrade(ctx, target, "", updater.UpgradeOptions{NoBackup: noBackup})
			})
		},
	}
	cmd.Flags().BoolVar(&noBackup, "no-backup", false, "skip the database snapshot; the upgrade then has no undo")
	return needsRoot(modes(cmd, modeServer))
}

func newUndoCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "undo",
		Short: "Undo the last upgrade: the previous release with its database snapshot",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runInProcess(cmd.Context(), func(_ context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error) {
				return manager.Rollback("")
			})
		},
	}
	return needsRoot(modes(cmd, modeServer))
}
