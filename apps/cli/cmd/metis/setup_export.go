package main

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/client"
	"golang.org/x/mod/semver"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/dbcopy"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type fromExport struct {
	meta    *archive.Metadata
	tmp     string
	files   map[string]string
	boot    *export.Env
	console bool
}

func openExport(ctx context.Context, path string, id identityFlags, parent string) (*fromExport, error) {
	meta, err := archive.ReadMetadata(path)
	if err != nil {
		return nil, err
	}
	identity, err := id.read(ctx)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return nil, err
	}
	if err := archive.CleanStale(parent); err != nil {
		return nil, err
	}
	tmp, err := archive.TempDir(parent)
	if err != nil {
		return nil, err
	}
	files, err := archive.Extract(path, identity, tmp)
	if err != nil {
		_ = os.RemoveAll(tmp)
		return nil, err
	}
	raw, err := os.ReadFile(files[archive.BootEnv])
	if err != nil {
		_ = os.RemoveAll(tmp)
		return nil, err
	}
	boot, err := export.ParseEnv(string(raw))
	if err != nil {
		_ = os.RemoveAll(tmp)
		return nil, fmt.Errorf("reading the export's boot.env: %w", err)
	}
	return &fromExport{meta: meta, tmp: tmp, files: files, boot: boot}, nil
}

func (fx *fromExport) close() {
	if fx != nil {
		_ = os.RemoveAll(fx.tmp)
	}
}

func exportDomain(authURL string) string {
	parsed, err := url.Parse(authURL)
	if err != nil {
		return ""
	}
	host := parsed.Hostname()
	if host == "" || host == "localhost" || net.ParseIP(host) != nil {
		return ""
	}
	return host
}

func (fx *fromExport) checkRelease(version string) error {
	needed := fx.meta.Header.AppVersion
	if semver.Compare("v"+version, "v"+needed) < 0 {
		return fmt.Errorf("This export needs Metis %s or later; run sudo metis self-update", needed)
	}
	return nil
}

func (fx *fromExport) applyTo(env *envfile.File) {
	for _, line := range fx.boot.Lines() {
		key, value, _ := strings.Cut(line, "=")
		env.Set(key, value)
	}
}

func (fx *fromExport) loader(stk *stack.Stack, env *envfile.File) components.Hook {
	return func(ctx context.Context) error {
		app, err := stackClient(ctx, stk, env.Value("DATABASE_URL"), env.Value("DATABASE_AUTH_TOKEN"))
		if err != nil {
			return err
		}
		mastra, err := stackClient(ctx, stk, env.Value("MASTRA_DATABASE_URL"), env.Value("MASTRA_DATABASE_AUTH_TOKEN"))
		if err != nil {
			return err
		}
		ui.Faint("  loading the app database from the export")
		if _, err := dbcopy.Load(ctx, fx.files[archive.App], app); err != nil {
			return fmt.Errorf("loading the app database: %w", err)
		}
		ui.Faint("  loading the Mastra database from the export")
		if _, err := dbcopy.Load(ctx, fx.files[archive.Mastra], mastra); err != nil {
			return fmt.Errorf("loading the Mastra database: %w", err)
		}
		rows, err := app.Query(ctx, "SELECT mail_driver FROM instance_config WHERE is_current = 1")
		if err == nil && len(rows.Rows) > 0 && rows.Rows[0][0] == "console" {
			fx.console = true
		}
		return nil
	}
}

func (fx *fromExport) notices(env *envfile.File) {
	previous := fx.boot.Get("BETTER_AUTH_URL")
	if current := env.Value("BETTER_AUTH_URL"); previous != "" && current != previous {
		ui.Warn("BETTER_AUTH_URL changes from %s to %s, so register the Google, Microsoft and Zoho redirect URIs again for the new address, and every MCP client must sign in again.", previous, current)
	}
	if fx.console || fx.boot.Get("METIS_MAIL_DRIVER") == "console" {
		ui.Warn("The export sends mail through the Metis Cloud console, which works only on Cloud. Set outgoing mail: sudo metis config set METIS_MAIL_DRIVER=…")
	}
	if _, ok := fx.files[archive.GatewayResend]; ok {
		ui.Info("The export holds a Resend gateway's database. Setup does not restore it; metis export decrypt writes it as gateway-resend.sqlite.")
	}
}

func readRecipientPEMs(paths []string) ([]string, error) {
	var out []string
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if _, err := keys.ParsePublic(data); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		out = append(out, string(data))
	}
	return out, nil
}

func validRecipientFile(path string) error {
	if path == "" {
		return nil
	}
	_, err := readRecipientPEMs([]string{path})
	return err
}

func undoFailedRestore(ctx context.Context, stk *stack.Stack, dir string, cause error) error {
	cleanup := context.WithoutCancel(ctx)
	var problems []string
	if managed, err := stk.Managed(cleanup); err == nil {
		for name := range managed {
			if _, err := stk.Engine.ContainerRemove(cleanup, name, client.ContainerRemoveOptions{Force: true}); err != nil && !cerrdefs.IsNotFound(err) {
				problems = append(problems, err.Error())
			}
		}
	} else {
		problems = append(problems, err.Error())
	}
	for _, volume := range []string{"metis-sqld", "metis-sqld-resend", "metis-redis", "metis-objstore", "metis-gateway-resend", "metis-caddy-data", "metis-caddy-config", "metis-updater"} {
		if _, err := stk.Engine.VolumeRemove(cleanup, volume, client.VolumeRemoveOptions{Force: true}); err != nil && !cerrdefs.IsNotFound(err) {
			problems = append(problems, err.Error())
		}
	}
	if err := os.RemoveAll(dir); err != nil {
		problems = append(problems, err.Error())
	}
	if err := mode.Forget(); err != nil {
		problems = append(problems, err.Error())
	}
	if len(problems) > 0 {
		return fmt.Errorf("%w\nRestoring the export failed, and removing the half-made install also failed (%s); remove %s, %s and the metis-* containers by hand before setup again", cause, strings.Join(problems, "; "), dir, mode.InstallDirFile)
	}
	return fmt.Errorf("%w\nRestoring the export failed, so setup removed what it had made; fix the cause and run setup again", cause)
}
