package mode

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type Mode int

const (
	Remote Mode = iota
	Server
)

const (
	InstallDirFile    = "/etc/metis/install-dir"
	DefaultInstallDir = "/opt/metis-suite"
)

var ErrNoInstall = errors.New("This machine has no Metis install")

type Detected struct {
	Mode       Mode
	InstallDir string
}

func (mode Mode) String() string {
	if mode == Server {
		return "server"
	}
	return "remote"
}

func Detect() (Detected, error) {
	if runtime.GOOS != "linux" {
		return Detected{Mode: Remote}, nil
	}
	raw, err := os.ReadFile(InstallDirFile)
	if errors.Is(err, os.ErrNotExist) {
		return Detected{Mode: Remote}, nil
	}
	if err != nil {
		return Detected{}, fmt.Errorf("reading %s: %w", InstallDirFile, err)
	}
	dir := strings.TrimSpace(string(raw))
	if dir == "" || !filepath.IsAbs(dir) {
		return Detected{}, fmt.Errorf("%s holds %q, which is not an absolute path", InstallDirFile, dir)
	}
	return Detected{Mode: Server, InstallDir: dir}, nil
}

func Forget() error {
	if err := os.Remove(InstallDirFile); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func Record(dir string) error {
	if err := os.MkdirAll(filepath.Dir(InstallDirFile), 0o755); err != nil {
		return err
	}
	return os.WriteFile(InstallDirFile, []byte(dir+"\n"), 0o644)
}
