package hrana_test

import (
	"bytes"
	"context"
	"math"
	"path/filepath"
	"strings"
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/hrana/hranatest"
)

func TestBaseURL(t *testing.T) {
	for raw, want := range map[string]string{
		"libsql://metis-acme.turso.io":       "https://metis-acme.turso.io",
		"libsql://metis-acme.turso.io?tls=1": "https://metis-acme.turso.io",
		"http://app.sqld:8080":               "http://app.sqld:8080",
		"https://db.example.com/":            "https://db.example.com",
		"wss://db.example.com":               "https://db.example.com",
		"ws://127.0.0.1:8080":                "http://127.0.0.1:8080",
	} {
		got, err := hrana.BaseURL(raw)
		if err != nil || got != want {
			t.Fatalf("%s: %q %v", raw, got, err)
		}
	}
	for _, raw := range []string{"file:./metis.db", "postgres://x", "libsql://"} {
		if _, err := hrana.BaseURL(raw); err == nil {
			t.Fatalf("%s was accepted", raw)
		}
	}
}

func client(t *testing.T, token string) (*hrana.Client, *hranatest.Server) {
	t.Helper()
	server := hranatest.New(t, filepath.Join(t.TempDir(), "db.sqlite"), token)
	db, err := hrana.New(server.URL, token)
	if err != nil {
		t.Fatal(err)
	}
	return db, server
}

func TestValuesRoundTrip(t *testing.T) {
	db, _ := client(t, "secret")
	ctx := context.Background()
	if _, err := db.Execute(ctx, hrana.Stmt{SQL: "CREATE TABLE t (i INTEGER, f REAL, s TEXT, b BLOB, n)"}); err != nil {
		t.Fatal(err)
	}
	values := []any{int64(math.MaxInt64), 0.1 + 0.2, "zażółć ✉ \"quoted\"\n", []byte{0, 1, 2, 255}, nil}
	if _, err := db.Execute(ctx, hrana.Stmt{SQL: "INSERT INTO t VALUES (?, ?, ?, ?, ?)", Args: values}); err != nil {
		t.Fatal(err)
	}
	rows, err := db.Query(ctx, "SELECT i, f, s, b, n FROM t")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(rows.Columns, ",") != "i,f,s,b,n" || len(rows.Rows) != 1 {
		t.Fatalf("rows %+v", rows)
	}
	row := rows.Rows[0]
	if row[0] != int64(math.MaxInt64) || row[1] != 0.1+0.2 || row[2] != values[2] || !bytes.Equal(row[3].([]byte), values[3].([]byte)) || row[4] != nil {
		t.Fatalf("row %#v", row)
	}
}

func TestErrorsNameTheStatement(t *testing.T) {
	db, _ := client(t, "")
	_, err := db.Execute(context.Background(), hrana.Stmt{SQL: "SELECT * FROM missing_table"})
	if err == nil || !strings.Contains(err.Error(), "SELECT * FROM missing_table") || !strings.Contains(err.Error(), "missing_table") {
		t.Fatalf("err %v", err)
	}
}

func TestWrongTokenIsReported(t *testing.T) {
	server := hranatest.New(t, filepath.Join(t.TempDir(), "db.sqlite"), "right")
	db, _ := hrana.New(server.URL, "wrong")
	if _, err := db.Query(context.Background(), "SELECT 1"); err == nil || !strings.Contains(err.Error(), "refused the token") {
		t.Fatalf("err %v", err)
	}
}

func TestBatchStopsAtTheFirstFailureAndCommitsNothing(t *testing.T) {
	db, _ := client(t, "")
	ctx := context.Background()
	if _, err := db.Execute(ctx, hrana.Stmt{SQL: "CREATE TABLE t (id INTEGER PRIMARY KEY)"}); err != nil {
		t.Fatal(err)
	}
	err := db.Batch(ctx, []hrana.Stmt{
		{SQL: "BEGIN"},
		{SQL: "INSERT INTO t VALUES (1)"},
		{SQL: "INSERT INTO t VALUES (1)"},
		{SQL: "INSERT INTO t VALUES (2)"},
		{SQL: "COMMIT"},
	})
	if err == nil || !strings.Contains(err.Error(), "INSERT INTO t VALUES (1)") {
		t.Fatalf("err %v", err)
	}
	rows, _ := db.Query(ctx, "SELECT COUNT(*) FROM t")
	if count, _ := hrana.Int(rows.Rows[0][0]); count != 0 {
		t.Fatalf("a failed batch left %d rows", count)
	}
	if err := db.Batch(ctx, []hrana.Stmt{{SQL: "BEGIN"}, {SQL: "INSERT INTO t VALUES (3)"}, {SQL: "COMMIT"}}); err != nil {
		t.Fatal(err)
	}
	rows, _ = db.Query(ctx, "SELECT COUNT(*) FROM t")
	if count, _ := hrana.Int(rows.Rows[0][0]); count != 1 {
		t.Fatalf("count %d", count)
	}
}
