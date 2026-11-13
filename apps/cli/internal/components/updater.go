package components

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/coreos/go-systemd/v22/dbus"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

const (
	UnitName = "metis-updater.service"
	UnitPath = "/etc/systemd/system/" + UnitName
	unit     = `[Unit]
Description=Metis updater
After=docker.service
Requires=docker.service

[Service]
ExecStart=/usr/local/bin/metis updater serve
Restart=always
RuntimeDirectory=metis-updater
RuntimeDirectoryPreserve=yes

[Install]
WantedBy=multi-user.target
`
)

func SystemdRunning() bool {
	info, err := os.Stat("/run/systemd/system")
	return err == nil && info.IsDir()
}

func DefaultUpdaterMode() state.UpdaterMode {
	if SystemdRunning() {
		return state.UpdaterSystemd
	}
	return state.UpdaterDocker
}

func systemd(ctx context.Context, use func(conn *dbus.Conn) error) error {
	conn, err := dbus.NewSystemConnectionContext(ctx)
	if err != nil {
		return fmt.Errorf("connecting to systemd: %w", err)
	}
	defer conn.Close()
	return use(conn)
}

func waitJob(ctx context.Context, start func(chan<- string) (int, error)) error {
	done := make(chan string, 1)
	if _, err := start(done); err != nil {
		return err
	}
	select {
	case result := <-done:
		if result != "done" {
			return fmt.Errorf("systemd job ended %s", result)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func InstallUnit(ctx context.Context) error {
	if err := os.WriteFile(UnitPath, []byte(unit), 0o644); err != nil {
		return err
	}
	return systemd(ctx, func(conn *dbus.Conn) error {
		if err := conn.ReloadContext(ctx); err != nil {
			return err
		}
		if _, _, err := conn.EnableUnitFilesContext(ctx, []string{UnitName}, false, true); err != nil {
			return err
		}
		return waitJob(ctx, func(ch chan<- string) (int, error) {
			return conn.RestartUnitContext(ctx, UnitName, "replace", ch)
		})
	})
}

func RestartUnit(ctx context.Context) error {
	return systemd(ctx, func(conn *dbus.Conn) error {
		return waitJob(ctx, func(ch chan<- string) (int, error) {
			return conn.RestartUnitContext(ctx, UnitName, "replace", ch)
		})
	})
}

func RemoveUnit(ctx context.Context) error {
	if _, err := os.Stat(UnitPath); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	err := systemd(ctx, func(conn *dbus.Conn) error {
		if err := waitJob(ctx, func(ch chan<- string) (int, error) {
			return conn.StopUnitContext(ctx, UnitName, "replace", ch)
		}); err != nil {
			return err
		}
		if _, err := conn.DisableUnitFilesContext(ctx, []string{UnitName}, false); err != nil {
			return err
		}
		if err := os.Remove(UnitPath); err != nil {
			return err
		}
		return conn.ReloadContext(ctx)
	})
	return err
}

func UnitState(ctx context.Context) string {
	state := "unknown"
	_ = systemd(ctx, func(conn *dbus.Conn) error {
		property, err := conn.GetUnitPropertyContext(ctx, UnitName, "ActiveState")
		if err == nil {
			if value, ok := property.Value.Value().(string); ok {
				state = value
			}
		}
		return err
	})
	return state
}

type updaterComponent struct{}

func (updaterComponent) Name() string                  { return "updater" }
func (updaterComponent) Requires() []string            { return nil }
func (updaterComponent) Warning(*Install, bool) string { return "" }

func (updaterComponent) Validate(*state.State) error { return nil }

func (updaterComponent) Status(ctx context.Context, st *state.State) (string, bool) {
	updater := st.Components.Updater
	if updater == nil {
		return "", false
	}
	if updater.Mode == state.UpdaterSystemd {
		return "systemd unit " + UnitName + " (" + UnitState(ctx) + ")", true
	}
	return "container metis-updater", true
}

func (updaterComponent) Add(_ context.Context, in *Install, opts Options) error {
	mode := opts.UpdaterMode
	if mode == "" {
		mode = DefaultUpdaterMode()
	}
	if mode == state.UpdaterSystemd && !SystemdRunning() {
		return errors.New("--systemd needs systemd as PID 1; use --docker")
	}
	in.State.Components.Updater = &state.UpdaterComponent{Mode: mode}
	if mode == state.UpdaterSystemd {
		in.Before = append(in.Before, InstallUnit)
	} else {
		in.After = append(in.After, RemoveUnit)
	}
	return nil
}

func (updaterComponent) Remove(_ context.Context, in *Install, opts Options) error {
	purge := opts.Purge
	in.State.Components.Updater = nil
	in.After = append(in.After, RemoveUnit)
	in.Notice("The Updates page disappears from the dashboard; upgrade with metis update")
	if purge {
		in.Purge = append(in.Purge, "metis-updater")
	}
	return nil
}
