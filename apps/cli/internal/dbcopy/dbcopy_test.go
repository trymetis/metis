package dbcopy

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/hrana/hranatest"
)

var seedSQL = []string{
	`CREATE TABLE counter (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL)`,
	`CREATE TABLE pair (a TEXT NOT NULL, b INTEGER NOT NULL, payload BLOB, PRIMARY KEY (a, b)) WITHOUT ROWID`,
	`CREATE TABLE plain (name TEXT, created TIMESTAMP, score REAL, data BLOB)`,
	`CREATE TABLE "weird ""name"" table" (x)`,
	`CREATE TABLE child (id TEXT PRIMARY KEY, counter_id INTEGER REFERENCES counter(id))`,
	`CREATE TABLE gen (a INTEGER, b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL)`,
	`CREATE INDEX plain_name ON plain (name)`,
	`CREATE VIEW labels AS SELECT label FROM counter`,
	`CREATE TRIGGER counter_touch AFTER INSERT ON counter BEGIN UPDATE plain SET score = score + 1; END`,
}

func seed(t *testing.T, path string) {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, statement := range seedSQL[:6] {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	for index := 1; index <= 5; index++ {
		_, _ = db.Exec(`INSERT INTO counter (label) VALUES (?)`, fmt.Sprintf("label %d", index))
	}
	_, _ = db.Exec(`DELETE FROM counter WHERE id > 3`)
	tx, _ := db.Begin()
	for index := range 2500 {
		payload := make([]byte, 8)
		_, _ = rand.Read(payload)
		_, _ = tx.Exec(`INSERT INTO pair VALUES (?, ?, ?)`, fmt.Sprintf("key-%04d", index%37), index, payload)
	}
	_ = tx.Commit()
	blob := make([]byte, 4096)
	_, _ = rand.Read(blob)
	rows := [][]any{
		{"zażółć ✉", "2026-11-11 10:00:00", 0.1, blob},
		{nil, nil, nil, nil},
		{"second", "not a date", 1e300, []byte{}},
		{"third", "2026-11-11T10:00:00Z", math.Copysign(0, -1), []byte{0}},
	}
	for _, row := range rows {
		_, _ = db.Exec(`INSERT INTO plain VALUES (?, ?, ?, ?)`, row...)
	}
	_, _ = db.Exec(`DELETE FROM plain WHERE name = 'second'`)
	_, _ = db.Exec(`INSERT INTO "weird ""name"" table" VALUES (42)`)
	_, _ = db.Exec(`INSERT INTO child VALUES ('c1', 2), ('c2', 99)`)
	_, _ = db.Exec(`INSERT INTO gen (a) VALUES (1), (21)`)
	for _, statement := range seedSQL[6:] {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
}

func snapshot(t *testing.T, path string) map[string]any {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	objects, err := localObjects(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]any{}
	var schema []string
	for _, obj := range objects {
		schema = append(schema, obj.Type+" "+obj.Name+" "+obj.SQL)
		if obj.Type != "table" {
			continue
		}
		table, err := localTable(ctx, db, obj)
		if err != nil {
			t.Fatal(err)
		}
		query := fmt.Sprintf("SELECT %s FROM %s ORDER BY 1, 2", selectList(table.Columns), quote(table.Name))
		if !table.WithoutRowid {
			query = fmt.Sprintf("SELECT rowid, %s FROM %s ORDER BY rowid", selectList(table.Columns), quote(table.Name))
		}
		out[table.Name] = rowsOf(t, db, query)
	}
	out["schema"] = schema
	out["sqlite_sequence"] = rowsOf(t, db, "SELECT name, seq FROM sqlite_sequence ORDER BY name")
	return out
}

func rowsOf(t *testing.T, db *sql.DB, query string) [][]any {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, _ := rows.Columns()
	var out [][]any
	for rows.Next() {
		cells := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for index := range cells {
			pointers[index] = &cells[index]
		}
		if err := rows.Scan(pointers...); err != nil {
			t.Fatal(err)
		}
		out = append(out, cells)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func expectSame(t *testing.T, want, got map[string]any) {
	t.Helper()
	for key, value := range want {
		if !reflect.DeepEqual(value, got[key]) {
			t.Fatalf("%s differs:\nwant %v\n got %v", key, value, got[key])
		}
	}
	if len(want) != len(got) {
		t.Fatalf("%d entries, want %d", len(got), len(want))
	}
}

func roundTrip(t *testing.T, target *hrana.Client) {
	t.Helper()
	ctx := context.Background()
	dir := t.TempDir()
	source := filepath.Join(dir, "source.sqlite")
	seed(t, source)
	want := snapshot(t, source)
	if seq := want["sqlite_sequence"].([][]any); len(seq) != 1 || seq[0][1] != int64(5) {
		t.Fatalf("the seed lost its sequence: %v", seq)
	}

	loaded, err := Load(ctx, source, target)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Tables != 6 || loaded.Rows != 2500+3+3+1+2+2 {
		t.Fatalf("loaded %+v", loaded)
	}
	copied := filepath.Join(dir, "copy.sqlite")
	dumped, err := Dump(ctx, target, copied)
	if err != nil {
		t.Fatal(err)
	}
	if dumped != loaded {
		t.Fatalf("dumped %+v, loaded %+v", dumped, loaded)
	}
	expectSame(t, want, snapshot(t, copied))
	if _, err := Load(ctx, source, target); err == nil || !strings.Contains(err.Error(), "is not empty") {
		t.Fatalf("a second load into the same database: %v", err)
	}
}

func TestLoadThenDumpIsExact(t *testing.T) {
	server := hranatest.New(t, filepath.Join(t.TempDir(), "remote.sqlite"), "token")
	target, err := hrana.New(server.URL, "token")
	if err != nil {
		t.Fatal(err)
	}
	roundTrip(t, target)
	size, err := Size(context.Background(), target)
	if err != nil || size <= 0 {
		t.Fatalf("size %d %v", size, err)
	}
}

func TestTriggersDoNotFireWhileLoading(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	source := filepath.Join(dir, "source.sqlite")
	seed(t, source)
	server := hranatest.New(t, filepath.Join(dir, "remote.sqlite"), "")
	target, _ := hrana.New(server.URL, "")
	if _, err := Load(ctx, source, target); err != nil {
		t.Fatal(err)
	}
	rows, err := target.Query(ctx, "SELECT score FROM plain WHERE name = 'zażółć ✉'")
	if err != nil {
		t.Fatal(err)
	}
	if rows.Rows[0][0] != 0.1 {
		t.Fatalf("the trigger fired during the load: %v", rows.Rows[0][0])
	}
}

func TestDumpRefusesAnExistingFile(t *testing.T) {
	server := hranatest.New(t, filepath.Join(t.TempDir(), "remote.sqlite"), "")
	src, _ := hrana.New(server.URL, "")
	existing := filepath.Join(t.TempDir(), "app.sqlite")
	_ = os.WriteFile(existing, []byte("x"), 0o600)
	if _, err := Dump(context.Background(), src, existing); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("err %v", err)
	}
}
