package export

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/dbcopy"
	"github.com/trymetis/metis/apps/cli/internal/hrana"
)

type LoadOptions struct {
	Archive     string
	Identity    archive.Identity
	AppURL      string
	AppToken    string
	MastraURL   string
	MastraToken string
	NewAuthURL  string
	Logf        func(format string, args ...any)
}

type LoadResult struct {
	Env         *Env
	AppVersion  string
	URLChanged  bool
	PreviousURL string
}

func Driver(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%q is not a URL", raw)
	}
	switch parsed.Scheme {
	case "libsql":
		return "turso", nil
	case "http", "https", "ws", "wss":
		return "sqld", nil
	}
	return "", fmt.Errorf("%q needs a libsql:// address (Turso) or an http(s):// or ws(s):// address (sqld)", raw)
}

type TargetFlags struct {
	AppURL, AppToken, MastraURL, MastraToken string
}

var LoadFlags = TargetFlags{AppURL: "--database-url", AppToken: "--database-token", MastraURL: "--mastra-url", MastraToken: "--mastra-token"}

func CheckTargets(flags TargetFlags, appURL, appToken, mastraURL, mastraToken string) (string, error) {
	app, err := Driver(appURL)
	if err != nil {
		return "", fmt.Errorf("%s: %w", flags.AppURL, err)
	}
	mastra, err := Driver(mastraURL)
	if err != nil {
		return "", fmt.Errorf("%s: %w", flags.MastraURL, err)
	}
	if app != mastra {
		return "", fmt.Errorf("%s and %s must both be Turso (libsql://) or both be sqld (http(s):// or ws(s)://), because the app runs one database driver", flags.AppURL, flags.MastraURL)
	}
	if appToken == "" || mastraToken == "" {
		return "", fmt.Errorf("pass %s and %s: the app needs a token for each database", flags.AppToken, flags.MastraToken)
	}
	return app, nil
}

func targetDriver(opts LoadOptions) (string, error) {
	return CheckTargets(LoadFlags, opts.AppURL, opts.AppToken, opts.MastraURL, opts.MastraToken)
}

func Load(ctx context.Context, opts LoadOptions) (LoadResult, error) {
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	driver, err := targetDriver(opts)
	if err != nil {
		return LoadResult{}, err
	}
	meta, err := archive.ReadMetadata(opts.Archive)
	if err != nil {
		return LoadResult{}, err
	}
	app, err := hrana.New(opts.AppURL, opts.AppToken)
	if err != nil {
		return LoadResult{}, fmt.Errorf("--database-url: %w", err)
	}
	mastra, err := hrana.New(opts.MastraURL, opts.MastraToken)
	if err != nil {
		return LoadResult{}, fmt.Errorf("--mastra-url: %w", err)
	}
	if err := dbcopy.Empty(ctx, app); err != nil {
		return LoadResult{}, fmt.Errorf("--database-url: %w", err)
	}
	if err := dbcopy.Empty(ctx, mastra); err != nil {
		return LoadResult{}, fmt.Errorf("--mastra-url: %w", err)
	}

	dir := filepath.Dir(opts.Archive)
	if err := archive.CleanStale(dir); err != nil {
		return LoadResult{}, err
	}
	tmp, err := archive.TempDir(dir)
	if err != nil {
		return LoadResult{}, err
	}
	defer os.RemoveAll(tmp)
	opts.Logf("decrypting the archive")
	written, err := archive.Extract(opts.Archive, opts.Identity, tmp, archive.App, archive.Mastra, archive.BootEnv)
	if err != nil {
		return LoadResult{}, err
	}
	opts.Logf("loading the app database")
	if _, err := dbcopy.Load(ctx, written[archive.App], app); err != nil {
		return LoadResult{}, fmt.Errorf("loading the app database: %w", err)
	}
	opts.Logf("loading the Mastra database")
	if _, err := dbcopy.Load(ctx, written[archive.Mastra], mastra); err != nil {
		return LoadResult{}, fmt.Errorf("loading the Mastra database (the app database is already loaded): %w", err)
	}

	raw, err := os.ReadFile(written[archive.BootEnv])
	if err != nil {
		return LoadResult{}, err
	}
	env, err := ParseEnv(string(raw))
	if err != nil {
		return LoadResult{}, fmt.Errorf("reading boot.env: %w", err)
	}
	env.Set("METIS_DB_DRIVER", driver)
	env.Set("DATABASE_URL", opts.AppURL)
	env.Set("DATABASE_AUTH_TOKEN", opts.AppToken)
	env.Set("MASTRA_DATABASE_URL", opts.MastraURL)
	env.Set("MASTRA_DATABASE_AUTH_TOKEN", opts.MastraToken)
	result := LoadResult{Env: env, AppVersion: meta.Header.AppVersion, PreviousURL: env.Get("BETTER_AUTH_URL")}
	if opts.NewAuthURL != "" && opts.NewAuthURL != result.PreviousURL {
		env.Set("BETTER_AUTH_URL", opts.NewAuthURL)
		result.URLChanged = true
	}
	return result, nil
}
