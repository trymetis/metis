package export

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/hrana/hranatest"
	"github.com/trymetis/metis/apps/cli/internal/keys"
)

var now = time.Date(2026, 11, 11, 10, 0, 0, 0, time.UTC)

func database(t *testing.T) (*hranatest.Server, *hrana.Client) {
	t.Helper()
	server := hranatest.New(t, filepath.Join(t.TempDir(), "db.sqlite"), "")
	client, err := hrana.New(server.URL, "")
	if err != nil {
		t.Fatal(err)
	}
	return server, client
}

func seal(t *testing.T, key []byte, plain string) string {
	t.Helper()
	block, _ := aes.NewCipher(key)
	aead, _ := cipher.NewGCM(block)
	iv := make([]byte, 12)
	_, _ = rand.Read(iv)
	sealed := aead.Seal(nil, iv, []byte(plain), nil)
	body, tag := sealed[:len(sealed)-16], sealed[len(sealed)-16:]
	return strings.Join([]string{"v1", base64.StdEncoding.EncodeToString(iv), base64.StdEncoding.EncodeToString(tag), base64.StdEncoding.EncodeToString(body)}, ":")
}

func exec(t *testing.T, db *hrana.Client, stmts ...hrana.Stmt) {
	t.Helper()
	if _, err := db.Execute(context.Background(), stmts...); err != nil {
		t.Fatal(err)
	}
}

type world struct {
	key     string
	app     *hrana.Client
	appURL  string
	mastra  *hrana.Client
	mURL    string
	envPath string
	site    *httptest.Server
	frozen  bool
}

func newWorld(t *testing.T) *world {
	t.Helper()
	raw := make([]byte, 32)
	_, _ = rand.Read(raw)
	w := &world{key: base64.StdEncoding.EncodeToString(raw), frozen: true}
	appServer, app := database(t)
	mastraServer, mastra := database(t)
	w.app, w.appURL, w.mastra, w.mURL = app, appServer.URL, mastra, mastraServer.URL
	exec(t, app,
		hrana.Stmt{SQL: "CREATE TABLE instance_config (version INTEGER PRIMARY KEY AUTOINCREMENT, is_current INTEGER NOT NULL, servers TEXT NOT NULL)"},
		hrana.Stmt{SQL: "CREATE TABLE schema_migration (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)"},
		hrana.Stmt{SQL: "CREATE TABLE workflow_run (id TEXT PRIMARY KEY, lease_expires_at INTEGER)"},
		hrana.Stmt{SQL: "CREATE TABLE workflow_tick (id TEXT PRIMARY KEY, lease_expires_at INTEGER)"},
		hrana.Stmt{SQL: "CREATE TABLE mail (id TEXT PRIMARY KEY, subject TEXT)"},
		hrana.Stmt{SQL: "INSERT INTO instance_config (is_current, servers) VALUES (0, 'old'), (1, ?)", Args: []any{seal(t, raw, `{"imap":[]}`)}},
		hrana.Stmt{SQL: "INSERT INTO schema_migration VALUES ('0000_baseline', 1), ('0009_mail_signatures', 2)"},
		hrana.Stmt{SQL: "INSERT INTO workflow_run VALUES ('done', ?)", Args: []any{now.Add(-time.Minute).UnixMilli()}},
		hrana.Stmt{SQL: "INSERT INTO mail VALUES ('m1', 'Hello'), ('m2', 'zażółć')"},
	)
	exec(t, mastra,
		hrana.Stmt{SQL: "CREATE TABLE mastra_threads (id TEXT PRIMARY KEY, createdAt TIMESTAMP)"},
		hrana.Stmt{SQL: "INSERT INTO mastra_threads VALUES ('t1', '2026-11-10 09:00:00')"},
	)
	w.site = httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if !w.frozen {
			rw.WriteHeader(http.StatusOK)
			return
		}
		rw.Header().Set("Metis-Maintenance", "2026-11-11T09:58:00.000Z")
		rw.Header().Set("Metis-Version", "1.4.0")
		rw.Header().Set("Retry-After", "300")
		rw.WriteHeader(http.StatusServiceUnavailable)
		_, _ = rw.Write([]byte(`{"error":"maintenance"}`))
	}))
	t.Cleanup(w.site.Close)
	content := strings.Join([]string{
		"DATABASE_URL=" + w.appURL,
		"MASTRA_DATABASE_URL=" + w.mURL,
		"DATABASE_AUTH_TOKEN=",
		"METIS_DB_DRIVER=sqld",
		`METIS_ENCRYPTION_KEY="` + w.key + `"`,
		"BETTER_AUTH_SECRET=secret-secret-secret-secret-secret",
		"BETTER_AUTH_URL=https://mail.example.com",
		"METIS_OWNER_EMAIL=owner@example.com",
		"METIS_MAINTENANCE=2026-11-11T09:58:00Z",
		"SQLD_AUTH_JWT_KEY=jwt",
		"CONSOLE_MAIL_TOKEN=drop-me",
		`METIS_IMAP_SERVERS='[{"name":"Fastmail"}]'`,
		"",
	}, "\n")
	w.envPath = filepath.Join(t.TempDir(), "production.env")
	if err := os.WriteFile(w.envPath, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return w
}

func (w *world) options(t *testing.T, recipients ...*keys.Public) Options {
	t.Helper()
	env, err := ReadEnv(w.envPath)
	if err != nil {
		t.Fatal(err)
	}
	return Options{
		Env:        env,
		Recipients: recipients,
		OutDir:     t.TempDir(),
		AppURL:     w.site.URL,
		DropEnv:    []string{"CONSOLE_MAIL_TOKEN"},
		LeasePoll:  time.Millisecond,
		LeaseWait:  20 * time.Millisecond,
		Now:        func() time.Time { return now },
	}
}

func recipient(t *testing.T) (archive.Identity, *keys.Public) {
	t.Helper()
	private, err := keys.Generate()
	if err != nil {
		t.Fatal(err)
	}
	return archive.Identity{Key: private}, &keys.Public{Key: private.PublicKey()}
}

func TestExportThenLoad(t *testing.T) {
	w := newWorld(t)
	id, public := recipient(t)
	opts := w.options(t, public)
	result, err := Run(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if result.AppVersion != "1.4.0" || result.MaintenanceSince == nil || !result.MaintenanceSince.Equal(time.Date(2026, 11, 11, 9, 58, 0, 0, time.UTC)) {
		t.Fatalf("result %+v", result)
	}
	if filepath.Base(result.Path) != "metis-export-20261111T100000Z.tar" || result.Fingerprints[0] != keys.Fingerprint(public.Key) {
		t.Fatalf("result %+v", result)
	}
	if leftovers, _ := filepath.Glob(filepath.Join(opts.OutDir, archive.TempPrefix+"*")); len(leftovers) != 0 {
		t.Fatalf("temporary folders left: %v", leftovers)
	}
	meta, problems, err := archive.Inspect(result.Path)
	if err != nil || len(problems) != 0 {
		t.Fatalf("inspect %v %v", problems, err)
	}
	if meta.Header.Migration != "0009_mail_signatures" || meta.Header.Source != "sqld" {
		t.Fatalf("header %+v", meta.Header)
	}

	out := t.TempDir()
	if _, err := archive.Extract(result.Path, id, out, archive.BootEnv); err != nil {
		t.Fatal(err)
	}
	boot, _ := os.ReadFile(filepath.Join(out, "boot.env"))
	for _, gone := range []string{"DATABASE_URL", "MASTRA_DATABASE_URL", "DATABASE_AUTH_TOKEN", "METIS_DB_DRIVER", "METIS_MAINTENANCE", "SQLD_AUTH_JWT_KEY", "CONSOLE_MAIL_TOKEN"} {
		if strings.Contains(string(boot), gone+"=") {
			t.Fatalf("boot.env kept %s:\n%s", gone, boot)
		}
	}
	for _, kept := range []string{"METIS_ENCRYPTION_KEY=" + w.key + "\n", "BETTER_AUTH_URL=https://mail.example.com\n", `METIS_IMAP_SERVERS=[{"name":"Fastmail"}]` + "\n"} {
		if !strings.Contains(string(boot), kept) {
			t.Fatalf("boot.env lacks %q:\n%s", kept, boot)
		}
	}

	appServer, app := database(t)
	mastraServer, mastra := database(t)
	loaded, err := Load(context.Background(), LoadOptions{
		Archive: result.Path, Identity: id,
		AppURL: appServer.URL, MastraURL: mastraServer.URL, AppToken: "app-token-not-checked", MastraToken: "mastra-token",
		NewAuthURL: "https://new.example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	if loaded.AppVersion != "1.4.0" || !loaded.URLChanged || loaded.PreviousURL != "https://mail.example.com" {
		t.Fatalf("loaded %+v", loaded)
	}
	lines := loaded.Env.Lines()
	for _, want := range []string{"DATABASE_URL=" + appServer.URL, "MASTRA_DATABASE_URL=" + mastraServer.URL, "METIS_DB_DRIVER=sqld", "BETTER_AUTH_URL=https://new.example.com", "DATABASE_AUTH_TOKEN=app-token-not-checked"} {
		if !slices.Contains(lines, want) {
			t.Fatalf("env lacks %q: %v", want, lines)
		}
	}
	rows, err := app.Query(context.Background(), "SELECT id, +subject FROM mail ORDER BY id")
	if err != nil || len(rows.Rows) != 2 || rows.Rows[1][1] != "zażółć" {
		t.Fatalf("mail %+v %v", rows, err)
	}
	threads, err := mastra.Query(context.Background(), "SELECT +createdAt FROM mastra_threads")
	if err != nil || threads.Rows[0][0] != "2026-11-10 09:00:00" {
		t.Fatalf("threads %+v %v", threads, err)
	}
	seq, _ := app.Query(context.Background(), "SELECT seq FROM sqlite_sequence WHERE name = 'instance_config'")
	if count, _ := hrana.Int(seq.Rows[0][0]); count != 2 {
		t.Fatalf("sequence %v", seq.Rows)
	}

	if _, err := Load(context.Background(), LoadOptions{Archive: result.Path, Identity: id, AppURL: appServer.URL, MastraURL: w.mURL, AppToken: "t", MastraToken: "t"}); err == nil || !strings.Contains(err.Error(), "--database-url: the target database is not empty") {
		t.Fatalf("a load into a used database: %v", err)
	}
}

func TestMissingVariablesAreAllNamed(t *testing.T) {
	file, _ := envfile.Parse("DATABASE_URL=http://db\nBETTER_AUTH_URL=https://mail.example.com\n")
	_, public := recipient(t)
	_, err := Run(context.Background(), Options{Env: FromFile(file), Recipients: []*keys.Public{public}})
	if err == nil {
		t.Fatal("an incomplete environment was accepted")
	}
	for _, key := range []string{"MASTRA_DATABASE_URL", "METIS_ENCRYPTION_KEY", "BETTER_AUTH_SECRET", "METIS_OWNER_EMAIL"} {
		if !strings.Contains(err.Error(), key) {
			t.Fatalf("%s is not named: %v", key, err)
		}
	}
}

func TestWrongEncryptionKeyStopsTheExport(t *testing.T) {
	w := newWorld(t)
	_, public := recipient(t)
	opts := w.options(t, public)
	other := make([]byte, 32)
	_, _ = rand.Read(other)
	opts.Env.Set("METIS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(other))
	if _, err := Run(context.Background(), opts); err == nil || !strings.Contains(err.Error(), "is not the key this instance runs with") {
		t.Fatalf("err %v", err)
	}
	opts.Env.Set("METIS_ENCRYPTION_KEY", "short")
	if _, err := Run(context.Background(), opts); err == nil || !strings.Contains(err.Error(), "must be 32 bytes") {
		t.Fatalf("err %v", err)
	}
	if entries, _ := os.ReadDir(opts.OutDir); len(entries) != 0 {
		t.Fatalf("a refused export wrote %d files", len(entries))
	}
}

func TestMaintenanceIsRequiredUnlessForced(t *testing.T) {
	w := newWorld(t)
	w.frozen = false
	_, public := recipient(t)
	opts := w.options(t, public)
	if _, err := Run(context.Background(), opts); !errors.Is(err, ErrNotInMaintenance) {
		t.Fatalf("err %v", err)
	}
	opts.Force = true
	if _, err := Run(context.Background(), opts); err == nil || !strings.Contains(err.Error(), "--app-version") {
		t.Fatalf("err %v", err)
	}
	opts.AppVersion = "1.3.2"
	result, err := Run(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	meta, _ := archive.ReadMetadata(result.Path)
	if meta.Header.MaintenanceSince != nil || meta.Header.AppVersion != "1.3.2" {
		t.Fatalf("header %+v", meta.Header)
	}
}

func TestRunningWorkIsWaitedFor(t *testing.T) {
	w := newWorld(t)
	exec(t, w.app, hrana.Stmt{SQL: "INSERT INTO workflow_tick VALUES ('tick', ?)", Args: []any{now.Add(time.Minute).UnixMilli()}})
	_, public := recipient(t)
	opts := w.options(t, public)
	clock := now
	opts.Now = func() time.Time {
		clock = clock.Add(10 * time.Millisecond)
		return clock
	}
	if _, err := Run(context.Background(), opts); err == nil || !strings.Contains(err.Error(), "a worker on another host may be missing METIS_MAINTENANCE") {
		t.Fatalf("err %v", err)
	}
	exec(t, w.app, hrana.Stmt{SQL: "DELETE FROM workflow_tick"})
	if _, err := Run(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
}

func TestQuotedValues(t *testing.T) {
	env, err := ParseEnv("A=\"quoted \\\"inner\\\" value\"\nB='single'\nC=plain=with=equals\nD=\"line\\nbreak\"\n")
	if err != nil {
		t.Fatal(err)
	}
	if env.Get("A") != `quoted "inner" value` || env.Get("B") != "single" || env.Get("C") != "plain=with=equals" || env.Get("D") != "line\nbreak" {
		t.Fatalf("values %q %q %q %q", env.Get("A"), env.Get("B"), env.Get("C"), env.Get("D"))
	}
	if _, err := env.Boot(nil); err == nil || !strings.Contains(err.Error(), "D holds a line break") {
		t.Fatalf("err %v", err)
	}
	if boot, err := env.Boot([]string{"D"}); err != nil || strings.Contains(boot, "D=") {
		t.Fatalf("boot %q %v", boot, err)
	}
	if Source("libsql://metis-acme.turso.io") != "turso" || Source("http://app.sqld:8080") != "sqld" {
		t.Fatal("source detection")
	}
}

func TestLoadTargetsMustMatchWhatTheAppAccepts(t *testing.T) {
	cases := map[string]LoadOptions{
		"needs a libsql:// address (Turso) or an http(s)": {AppURL: "postgres://db", MastraURL: "http://m", AppToken: "t", MastraToken: "t"},
		"must both be Turso (libsql://) or both be sqld":  {AppURL: "libsql://a.turso.io", MastraURL: "https://m.example.com", AppToken: "t", MastraToken: "t"},
		"pass --database-token and --mastra-token":        {AppURL: "http://a", MastraURL: "http://m", AppToken: "t"},
	}
	for want, opts := range cases {
		opts.Archive = filepath.Join(t.TempDir(), "missing.tar")
		if _, err := Load(context.Background(), opts); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("want %q, got %v", want, err)
		}
	}
	for raw, want := range map[string]string{"libsql://x.turso.io": "turso", "https://x.turso.io": "sqld", "ws://127.0.0.1:8080": "sqld", "libsql://sqld.example.com": "turso"} {
		if got, err := Driver(raw); err != nil || got != want {
			t.Fatalf("%s: %q %v", raw, got, err)
		}
	}
}

func TestWindowsLineEndings(t *testing.T) {
	env, err := ParseEnv("DATABASE_URL=libsql://a.turso.io\r\nBETTER_AUTH_URL=\"https://mail.example.com\"\r\n")
	if err != nil {
		t.Fatal(err)
	}
	if env.Get("DATABASE_URL") != "libsql://a.turso.io" || env.Get("BETTER_AUTH_URL") != "https://mail.example.com" {
		t.Fatalf("values %q %q", env.Get("DATABASE_URL"), env.Get("BETTER_AUTH_URL"))
	}
	if _, err := env.Boot(nil); err != nil {
		t.Fatal(err)
	}
}

func migrationDDL(t *testing.T) []string {
	t.Helper()
	source, err := os.ReadFile("../../../web/migrations/0010_export_records.ts")
	if err != nil {
		t.Fatal(err)
	}
	var statements []string
	for _, match := range regexp.MustCompile(`"((?:CREATE TABLE|CREATE INDEX)[^"]*)"`).FindAllStringSubmatch(string(source), -1) {
		statements = append(statements, strings.NewReplacer(`\n`, "\n", `\t`, "\t").Replace(match[1]))
	}
	if len(statements) == 0 {
		t.Fatal("no statements found in the migration")
	}
	return statements
}

func TestRecordColumnsMatchTheMigration(t *testing.T) {
	var columns []string
	for _, match := range regexp.MustCompile("`([a-z_0-9]+)` (?:text|integer)").FindAllStringSubmatch(migrationDDL(t)[0], -1) {
		columns = append(columns, match[1])
	}
	ours := slices.Clone(RecordColumns)
	slices.Sort(ours)
	slices.Sort(columns)
	if !slices.Equal(ours, columns) {
		t.Fatalf("the CLI writes %v, the migration creates %v", ours, columns)
	}
}

type recordedRow struct {
	createdAt, size                 int64
	since                           any
	version, migration, file, url   string
	recipients, locations, checksum string
}

func readRecord(t *testing.T, db *hrana.Client) recordedRow {
	t.Helper()
	rows, err := db.Query(context.Background(), "SELECT created_at, size, maintenance_since, app_version, migration, file_name, instance_url, recipients, locations, sha256 FROM export_record")
	if err != nil || len(rows.Rows) != 1 {
		t.Fatalf("records %v %v", rows.Rows, err)
	}
	row := rows.Rows[0]
	created, _ := hrana.Int(row[0])
	size, _ := hrana.Int(row[1])
	return recordedRow{createdAt: created, size: size, since: row[2], version: row[3].(string), migration: row[4].(string), file: row[5].(string), url: row[6].(string), recipients: row[7].(string), locations: row[8].(string), checksum: row[9].(string)}
}

func TestExportIsRecorded(t *testing.T) {
	w := newWorld(t)
	for _, statement := range migrationDDL(t) {
		exec(t, w.app, hrana.Stmt{SQL: statement})
	}
	_, public := recipient(t)
	opts := w.options(t, public)
	result, err := Run(context.Background(), opts)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Recorded || result.RecordError != nil {
		t.Fatalf("recorded %v %v", result.Recorded, result.RecordError)
	}
	row := readRecord(t, w.app)
	if row.createdAt != now.UnixMilli() || row.size != result.Size || row.version != "1.4.0" || row.migration != "0009_mail_signatures" ||
		row.file != "metis-export-20261111T100000Z.tar" || row.url != "https://mail.example.com" || row.checksum != result.SHA256 {
		t.Fatalf("row %+v", row)
	}
	if since, _ := hrana.Int(row.since); since != time.Date(2026, 11, 11, 9, 58, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("maintenance since %v", row.since)
	}
	if row.recipients != `[{"fingerprint":"`+keys.Fingerprint(public.Key)+`","passphrase":false}]` {
		t.Fatalf("recipients %s", row.recipients)
	}
	if !strings.Contains(row.locations, `"kind":"local","location":"`+result.Path+`"`) {
		t.Fatalf("locations %s", row.locations)
	}
}

func TestExportWithoutTheTableIsNotRecorded(t *testing.T) {
	w := newWorld(t)
	_, public := recipient(t)
	result, err := Run(context.Background(), w.options(t, public))
	if err != nil || result.Recorded || result.RecordError != nil {
		t.Fatalf("result %+v %v", result, err)
	}
}

func TestCloudExportIsNotRecorded(t *testing.T) {
	w := newWorld(t)
	for _, statement := range migrationDDL(t) {
		exec(t, w.app, hrana.Stmt{SQL: statement})
	}
	_, public := recipient(t)
	opts := w.options(t, public)
	opts.Env.Set("CONSOLE_MAIL_URL", "https://console.example.com/mail")
	opts.DropEnv = append(opts.DropEnv, "CONSOLE_MAIL_URL")
	result, err := Run(context.Background(), opts)
	if err != nil || !result.Cloud || result.Recorded || result.RecordError != nil {
		t.Fatalf("result %+v %v", result, err)
	}
	rows, err := w.app.Query(context.Background(), "SELECT COUNT(*) FROM export_record")
	if err != nil {
		t.Fatal(err)
	}
	if count, _ := hrana.Int(rows.Rows[0][0]); count != 0 {
		t.Fatalf("a Cloud export was recorded %d times", count)
	}
}

func TestExportToS3(t *testing.T) {
	for _, keepLocal := range []bool{false, true} {
		fake, endpoint := newFakeS3(t)
		w := newWorld(t)
		for _, statement := range migrationDDL(t) {
			exec(t, w.app, hrana.Stmt{SQL: statement})
		}
		_, public := recipient(t)
		opts := w.options(t, public)
		opts.S3 = &S3Target{Bucket: "backups", Prefix: "acme/", Endpoint: endpoint}
		opts.KeepLocal = keepLocal
		result, err := Run(context.Background(), opts)
		if err != nil {
			t.Fatal(err)
		}
		stored := fake.objects["backups/acme/metis-export-20261111T100000Z.tar"]
		if int64(len(stored)) != result.Size {
			t.Fatalf("stored %d bytes of %d", len(stored), result.Size)
		}
		local := filepath.Join(opts.OutDir, "metis-export-20261111T100000Z.tar")
		_, statErr := os.Stat(local)
		row := readRecord(t, w.app)
		if !strings.Contains(row.locations, `{"kind":"s3","location":"s3://backups/acme/metis-export-20261111T100000Z.tar","host":null,"endpoint":"`+endpoint+`"}`) {
			t.Fatalf("locations %s", row.locations)
		}
		if keepLocal {
			if statErr != nil || result.Path != local || !strings.Contains(row.locations, `"kind":"local"`) || len(result.Locations) != 2 {
				t.Fatalf("keep-local: %v %+v %s", statErr, result, row.locations)
			}
		} else if statErr == nil || result.Path != "" || strings.Contains(row.locations, `"kind":"local"`) || len(result.Locations) != 1 {
			t.Fatalf("the local archive survived the upload: %v %+v %s", statErr, result, row.locations)
		}
	}
}
