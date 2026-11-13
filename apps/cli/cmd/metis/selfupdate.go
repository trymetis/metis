package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
	"github.com/trymetis/metis/apps/cli/internal/version"
)

const cliOrigin = updater.NotesOrigin + "/cli"

func cliBase(release string) string {
	if release == "" {
		return cliOrigin + "/"
	}
	return cliOrigin + "/v" + strings.TrimPrefix(release, "v") + "/"
}

func binaryName() string {
	name := fmt.Sprintf("metis-%s-%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return name
}

func fetch(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "metis/"+version.Version)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", url, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, limit))
}

func checksumFor(sums []byte, name string) (string, error) {
	scanner := bufio.NewScanner(strings.NewReader(string(sums)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("SHA256SUMS lists no %s", name)
}

func replaceBinary(binary []byte) (string, error) {
	path, err := os.Executable()
	if err != nil {
		return "", err
	}
	if path, err = filepath.EvalSymlinks(path); err != nil {
		return "", err
	}
	tmp := filepath.Join(filepath.Dir(path), ".metis-update")
	if err := os.WriteFile(tmp, binary, 0o755); err != nil {
		return "", err
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		return "", err
	}
	return path, os.Rename(tmp, path)
}

func restartUpdater(ctx context.Context) error {
	st, err := state.Load(detected.InstallDir)
	if err != nil || st.Components.Updater == nil {
		return err
	}
	if st.Components.Updater.Mode == state.UpdaterSystemd {
		return components.RestartUnit(ctx)
	}
	stk, _, err := serverStack()
	if err != nil {
		return err
	}
	_, err = stk.Engine.ContainerRestart(ctx, "metis-updater", client.ContainerRestartOptions{})
	return err
}

func newSelfUpdateCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "self-update [VERSION]",
		Short: "Replace this binary with the newest Metis CLI, or VERSION",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			release := ""
			if len(args) == 1 {
				release = args[0]
			}
			base := cliBase(release)
			if runtime.GOOS == "windows" {
				ui.Info("Download the new CLI from %s%s and replace metis.exe with it.", base, binaryName())
				return nil
			}
			if release == "" {
				latest, err := fetch(ctx, base+"version.txt", 64)
				if err != nil {
					return err
				}
				release = strings.TrimSpace(string(latest))
				if release == version.Version {
					ui.Done("Metis CLI %s is the newest", version.Version)
					return nil
				}
			}
			sums, err := fetch(ctx, base+"SHA256SUMS", 64<<10)
			if err != nil {
				return err
			}
			want, err := checksumFor(sums, binaryName())
			if err != nil {
				return err
			}
			binary, err := fetch(ctx, base+binaryName(), 256<<20)
			if err != nil {
				return err
			}
			sum := sha256.Sum256(binary)
			if hex.EncodeToString(sum[:]) != want {
				return fmt.Errorf("%s does not match its SHA256SUMS entry", base+binaryName())
			}
			path, err := replaceBinary(binary)
			if err != nil {
				return err
			}
			ui.Done("Metis CLI %s is installed at %s", strings.TrimPrefix(release, "v"), path)
			if detected.Mode != mode.Server {
				return nil
			}
			if err := restartUpdater(ctx); err != nil {
				return fmt.Errorf("restarting the updater: %w", err)
			}
			ui.Info("The new CLI may define the containers differently.")
			apply := exec.CommandContext(ctx, path, "apply")
			if yes {
				apply.Args = append(apply.Args, "--yes")
			}
			apply.Stdin, apply.Stdout, apply.Stderr = os.Stdin, os.Stdout, os.Stderr
			return apply.Run()
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "apply the new service definitions without asking")
	return needsRoot(modes(cmd, modeServer, modeRemote))
}
