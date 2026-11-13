package export

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/dbcopy"
	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/keys"
)

const (
	maintenanceHeader = "Metis-Maintenance"
	versionHeader     = "Metis-Version"
	defaultLeasePoll  = 5 * time.Second
	defaultLeaseWait  = 5 * time.Minute
	encryptedPrefix   = "v1"
)

var ErrNotInMaintenance = errors.New("the app is not in maintenance. Set METIS_MAINTENANCE on the app and redeploy, then run this again")

type Options struct {
	Env        *Env
	Recipients []*keys.Public
	OutDir     string
	AppURL     string
	DropEnv    []string
	Force      bool
	AppVersion string
	HTTP       *http.Client
	LeasePoll  time.Duration
	LeaseWait  time.Duration
	Now        func() time.Time
	Logf       func(format string, args ...any)

	App              *hrana.Client
	Mastra           *hrana.Client
	MaintenanceSince *time.Time
	Extra            []archive.Source
	LocationKind     string
	S3               *S3Target
	KeepLocal        bool
}

type Result struct {
	Locations        []Location
	Recorded         bool
	Cloud            bool
	RecordError      error
	SHA256           string
	Path             string
	Size             int64
	Fingerprints     []string
	AppVersion       string
	MaintenanceSince *time.Time
}

type databases struct {
	app    *hrana.Client
	mastra *hrana.Client
	source string
}

func Source(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err == nil && strings.HasSuffix(parsed.Hostname(), ".turso.io") {
		return "turso"
	}
	return "sqld"
}

func connect(env *Env) (databases, error) {
	app, err := hrana.New(env.Get("DATABASE_URL"), env.Get("DATABASE_AUTH_TOKEN"))
	if err != nil {
		return databases{}, fmt.Errorf("DATABASE_URL: %w", err)
	}
	mastra, err := hrana.New(env.Get("MASTRA_DATABASE_URL"), env.Get("MASTRA_DATABASE_AUTH_TOKEN"))
	if err != nil {
		return databases{}, fmt.Errorf("MASTRA_DATABASE_URL: %w", err)
	}
	return databases{app: app, mastra: mastra, source: Source(env.Get("DATABASE_URL"))}, nil
}

func EncryptionKey(encoded string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(key) != 32 {
		return nil, errors.New("METIS_ENCRYPTION_KEY must be 32 bytes, base64-encoded")
	}
	return key, nil
}

func Unseal(key []byte, stored string) ([]byte, error) {
	parts := strings.Split(stored, ":")
	if len(parts) != 4 || parts[0] != encryptedPrefix {
		return nil, fmt.Errorf("the value is not sealed with %s", encryptedPrefix)
	}
	decoded := make([][]byte, 3)
	for index, part := range parts[1:] {
		raw, err := base64.StdEncoding.DecodeString(part)
		if err != nil {
			return nil, err
		}
		decoded[index] = raw
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCMWithNonceSize(block, len(decoded[0]))
	if err != nil {
		return nil, err
	}
	return aead.Open(nil, decoded[0], append(decoded[2], decoded[1]...), nil)
}

func CheckEncryptionKey(ctx context.Context, app *hrana.Client, encoded string) error {
	key, err := EncryptionKey(encoded)
	if err != nil {
		return err
	}
	rows, err := app.Query(ctx, "SELECT servers FROM instance_config WHERE is_current = 1 LIMIT 1")
	if err != nil {
		return fmt.Errorf("reading the stored settings: %w", err)
	}
	if len(rows.Rows) == 0 {
		return errors.New("the app database has no stored settings yet; run preflight against it before exporting")
	}
	stored, _ := rows.Rows[0][0].(string)
	if _, err := Unseal(key, stored); err != nil {
		return errors.New("METIS_ENCRYPTION_KEY does not open this database's stored settings, so it is not the key this instance runs with; an export made with it could never be read")
	}
	return nil
}

func CheckMaintenance(ctx context.Context, client *http.Client, appURL string) (time.Time, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, appURL, nil)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%q is not a URL: %w", appURL, err)
	}
	req.Header.Set("Accept", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("checking %s for maintenance: %w", appURL, err)
	}
	_ = res.Body.Close()
	header := res.Header.Get(maintenanceHeader)
	if res.StatusCode != http.StatusServiceUnavailable || header == "" {
		return time.Time{}, "", ErrNotInMaintenance
	}
	since, err := time.Parse(time.RFC3339Nano, header)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%s answered %s %q, which is not a time", appURL, maintenanceHeader, header)
	}
	return since, strings.TrimPrefix(res.Header.Get(versionHeader), "v"), nil
}

func WaitForWork(ctx context.Context, app *hrana.Client, poll, timeout time.Duration, now func() time.Time, logf func(string, ...any)) error {
	deadline := now().Add(timeout)
	logged := false
	for {
		nowMs := now().UnixMilli()
		results, err := app.Execute(ctx,
			hrana.Stmt{SQL: "SELECT COUNT(*) FROM workflow_run WHERE lease_expires_at > ?", Args: []any{nowMs}},
			hrana.Stmt{SQL: "SELECT COUNT(*) FROM workflow_tick WHERE lease_expires_at > ?", Args: []any{nowMs}},
		)
		if err != nil {
			return fmt.Errorf("checking for running work: %w", err)
		}
		runs, _ := hrana.Int(results[0].Rows[0][0])
		ticks, _ := hrana.Int(results[1].Rows[0][0])
		if runs == 0 && ticks == 0 {
			return nil
		}
		if !now().Before(deadline) {
			return errors.New("work is still running; a worker on another host may be missing METIS_MAINTENANCE")
		}
		if !logged {
			logf("waiting for %d running workflow runs and %d ticks to finish", runs, ticks)
			logged = true
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(poll):
		}
	}
}

func lastMigration(ctx context.Context, app *hrana.Client) (string, error) {
	rows, err := app.Query(ctx, "SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1")
	if err != nil {
		return "", fmt.Errorf("reading the applied migrations: %w", err)
	}
	if len(rows.Rows) == 0 {
		return "", errors.New("the app database has no applied migrations; run preflight against it before exporting")
	}
	id, _ := rows.Rows[0][0].(string)
	return id, nil
}

func (opts *Options) defaults() {
	if opts.HTTP == nil {
		opts.HTTP = &http.Client{Timeout: 30 * time.Second}
	}
	if opts.LeasePoll == 0 {
		opts.LeasePoll = defaultLeasePoll
	}
	if opts.LeaseWait == 0 {
		opts.LeaseWait = defaultLeaseWait
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	if opts.OutDir == "" {
		opts.OutDir = "."
	}
}

func CheckSpace(ctx context.Context, app, mastra *hrana.Client, dir string) error {
	return checkSpace(ctx, databases{app: app, mastra: mastra}, dir, nil)
}

func checkSpace(ctx context.Context, dbs databases, dir string, extra []archive.Source) error {
	var total int64
	for _, file := range extra {
		if info, err := os.Stat(file.Path); err == nil {
			total += info.Size()
		}
	}
	for _, db := range []*hrana.Client{dbs.app, dbs.mastra} {
		size, err := dbcopy.Size(ctx, db)
		if err != nil {
			return fmt.Errorf("reading the database size: %w", err)
		}
		total += size
	}
	need := uint64(total) * 2 * 11 / 10
	free, err := archive.FreeBytes(dir)
	if err != nil {
		return fmt.Errorf("checking free space in %s: %w", dir, err)
	}
	if free < need {
		return fmt.Errorf("%s has %d MB free; this export needs about %d MB (the databases are %d MB, copied once in plain form and once encrypted)", dir, free>>20, need>>20, total>>20)
	}
	return nil
}

func Run(ctx context.Context, opts Options) (Result, error) {
	opts.defaults()
	if missing := opts.Env.Missing(); len(missing) > 0 {
		return Result{}, fmt.Errorf("the environment lacks %s; a platform that hides sensitive values on pull needs them added to the file by hand", strings.Join(missing, ", "))
	}
	if len(opts.Recipients) == 0 {
		return Result{}, errors.New("pass at least one --recipient public key")
	}
	dbs, err := connect(opts.Env)
	if err != nil {
		return Result{}, err
	}
	if opts.App != nil && opts.Mastra != nil {
		dbs.app, dbs.mastra = opts.App, opts.Mastra
	}
	if err := CheckEncryptionKey(ctx, dbs.app, opts.Env.Get("METIS_ENCRYPTION_KEY")); err != nil {
		return Result{}, err
	}
	result := Result{AppVersion: opts.AppVersion}
	if opts.MaintenanceSince != nil {
		result.MaintenanceSince = opts.MaintenanceSince
	} else if opts.Force {
		if opts.AppVersion == "" {
			return Result{}, errors.New("--force needs --app-version, the release the app ran")
		}
		opts.Logf("skipping the maintenance check (--force)")
	} else {
		appURL := opts.AppURL
		if appURL == "" {
			appURL = opts.Env.Get("BETTER_AUTH_URL")
		}
		since, version, err := CheckMaintenance(ctx, opts.HTTP, appURL)
		if err != nil {
			return Result{}, err
		}
		result.MaintenanceSince = &since
		if result.AppVersion == "" {
			result.AppVersion = version
		}
	}
	if result.AppVersion == "" {
		return Result{}, errors.New("the app did not report its version; pass --app-version")
	}
	if err := os.MkdirAll(opts.OutDir, 0o700); err != nil {
		return Result{}, err
	}
	if err := archive.CleanStale(opts.OutDir); err != nil {
		return Result{}, err
	}
	if err := checkSpace(ctx, dbs, opts.OutDir, opts.Extra); err != nil {
		return Result{}, err
	}
	if err := WaitForWork(ctx, dbs.app, opts.LeasePoll, opts.LeaseWait, opts.Now, opts.Logf); err != nil {
		return Result{}, err
	}
	migration, err := lastMigration(ctx, dbs.app)
	if err != nil {
		return Result{}, err
	}
	boot, err := opts.Env.Boot(opts.DropEnv)
	if err != nil {
		return Result{}, err
	}

	tmp, err := archive.TempDir(opts.OutDir)
	if err != nil {
		return Result{}, err
	}
	defer os.RemoveAll(tmp)
	files := []archive.Source{
		{Name: archive.App, Path: filepath.Join(tmp, "app.sqlite")},
		{Name: archive.Mastra, Path: filepath.Join(tmp, "mastra.sqlite")},
		{Name: archive.BootEnv, Path: filepath.Join(tmp, "boot.env")},
	}
	opts.Logf("copying the app database")
	if _, err := dbcopy.Dump(ctx, dbs.app, files[0].Path); err != nil {
		return Result{}, fmt.Errorf("copying the app database: %w", err)
	}
	opts.Logf("copying the Mastra database")
	if _, err := dbcopy.Dump(ctx, dbs.mastra, files[1].Path); err != nil {
		return Result{}, fmt.Errorf("copying the Mastra database: %w", err)
	}
	if err := os.WriteFile(files[2].Path, []byte(boot), 0o600); err != nil {
		return Result{}, err
	}
	files = append(files, opts.Extra...)
	opts.Logf("encrypting the archive")
	createdAt := opts.Now()
	path, size, err := archive.Write(archive.Spec{
		Dir:              opts.OutDir,
		CreatedAt:        createdAt,
		AppVersion:       result.AppVersion,
		Migration:        migration,
		Source:           dbs.source,
		MaintenanceSince: result.MaintenanceSince,
		Recipients:       opts.Recipients,
		Files:            files,
	})
	if err != nil {
		return Result{}, err
	}
	result.Path, result.Size = path, size
	for _, recipient := range opts.Recipients {
		result.Fingerprints = append(result.Fingerprints, keys.Fingerprint(recipient.Key))
	}
	if result.SHA256, err = fileSHA256(path); err != nil {
		return Result{}, err
	}
	kind := opts.LocationKind
	if kind == "" {
		kind = LocationLocal
	}
	if opts.S3 != nil {
		opts.Logf("uploading to %s", opts.S3.URL(filepath.Base(path)))
		uploaded, err := Upload(ctx, *opts.S3, path, result.SHA256)
		if err != nil {
			return Result{}, fmt.Errorf("%w; the archive is still at %s", err, path)
		}
		location := Location{Kind: LocationS3, Location: uploaded}
		if opts.S3.Endpoint != "" {
			endpoint := opts.S3.Endpoint
			location.Endpoint = &endpoint
		}
		result.Locations = append(result.Locations, location)
		if opts.KeepLocal {
			result.Locations = append(result.Locations, localLocation(kind, path))
		} else {
			if err := os.Remove(path); err != nil {
				return Result{}, err
			}
			result.Path = ""
		}
	} else {
		result.Locations = append(result.Locations, localLocation(kind, path))
	}
	if opts.Env.Get(cloudMailKey) != "" {
		result.Cloud = true
		return result, nil
	}
	result.Recorded, result.RecordError = record(ctx, dbs.app, recordInput{
		createdAt:        createdAt,
		appVersion:       result.AppVersion,
		migration:        migration,
		maintenanceSince: result.MaintenanceSince,
		fileName:         filepath.Base(path),
		size:             size,
		sha256:           result.SHA256,
		recipients:       opts.Recipients,
		locations:        result.Locations,
		instanceURL:      opts.Env.Get("BETTER_AUTH_URL"),
	})
	return result, nil
}
