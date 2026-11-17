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
	"syscall"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/gen/metis/updater/v1/updaterv1connect"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

const updaterShutdownGrace = 5 * time.Second

type serveFlags struct {
	socket       string
	readyTimeout time.Duration
	releasesTTL  time.Duration
}

func newUpdaterServeCommand() *cobra.Command {
	flags := serveFlags{}
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Serve the updater protocol on its socket",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return serveUpdater(cmd.Context(), flags, func(name string) bool { return cmd.Flags().Changed(name) })
		},
	}
	cmd.Flags().StringVar(&flags.socket, "socket", updater.DefaultSocket, "the Unix socket to serve on (METIS_UPDATER_SOCKET)")
	cmd.Flags().DurationVar(&flags.readyTimeout, "ready-timeout", 2*time.Minute, "how long a new release has to answer /api/readyz (METIS_UPDATER_READY_TIMEOUT)")
	cmd.Flags().DurationVar(&flags.releasesTTL, "releases-ttl", 5*time.Minute, "how long the release list is cached (METIS_UPDATER_RELEASES_TTL)")
	return cmd
}

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
