package caddy

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

func fronted() *state.State {
	st := state.New()
	st.App.Version = "1.4.0"
	st.Components.Caddy = &state.Caddy{Domain: "mail.example.com"}
	st.Components.GatewayResend = &state.GatewayResend{Host: "resend.mail.example.com"}
	st.Components.Objstore = &state.Objstore{Direct: true}
	return st
}

func render(t *testing.T, sites []Site, window *Window) string {
	t.Helper()
	got, err := Render(sites, window)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestRender(t *testing.T) {
	st := state.New()
	if Sites(st) != nil || Fronts(st) {
		t.Fatal("sites without caddy")
	}
	st = fronted()
	want := "mail.example.com {\n\treverse_proxy app:3000\n}\n\nresend.mail.example.com {\n\treverse_proxy gateway-resend:8787\n}\n\nstorage.mail.example.com {\n\treverse_proxy objstore:9000\n}\n"
	if got := render(t, Sites(st), nil); got != want {
		t.Fatalf("Caddyfile:\n%s", got)
	}
}

func TestRenderInMaintenanceAnswersForTheAppOnly(t *testing.T) {
	since := time.Date(2026, 11, 11, 10, 0, 0, 0, time.FixedZone("ahead", 3600))
	got := render(t, Sites(fronted()), &Window{Since: since, Version: "1.4.0"})
	want := `mail.example.com {
	header Retry-After "300"
	header Cache-Control "no-store"
	header Metis-Maintenance "2026-11-11T09:00:00Z"
	header Metis-Version "1.4.0"
	@page {
		method GET HEAD
		header Accept *text/html*
	}
	handle @page {
		root * /etc/caddy
		rewrite * /maintenance.html
		file_server {
			status 503
		}
	}
	handle {
		header Content-Type "application/json"
		respond ` + "`" + `{"error":"maintenance","since":"2026-11-11T09:00:00Z"}` + "`" + ` 503
	}
}

resend.mail.example.com {
	reverse_proxy gateway-resend:8787
}

storage.mail.example.com {
	reverse_proxy objstore:9000
}
`
	if got != want {
		t.Fatalf("Caddyfile in maintenance:\n%s", got)
	}
	unpinned := render(t, Sites(fronted()), &Window{Since: since})
	if strings.Contains(unpinned, "Metis-Version") || !strings.Contains(unpinned, "\theader Metis-Maintenance \"2026-11-11T09:00:00Z\"\n\t@page {\n") {
		t.Fatalf("a version header without a version:\n%s", unpinned)
	}
}

func TestPageSaysWhenMaintenanceBegan(t *testing.T) {
	page, err := Page(Window{Since: time.Date(2026, 11, 11, 10, 0, 0, 0, time.FixedZone("ahead", 3600))})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"<!doctype html>",
		"<title>Down for maintenance</title>",
		"<h1>Down for maintenance</h1>",
		"<p>Since 09:00 UTC on 11 November 2026</p>",
		"<p>Try again in a few minutes.</p>",
	} {
		if !strings.Contains(page, want) {
			t.Fatalf("the page lacks %q:\n%s", want, page)
		}
	}
	if strings.Contains(page, "{{") {
		t.Fatalf("the page still holds template text:\n%s", page)
	}
}

func TestWriteKeepsTheCaddyfileInItsOwnFolder(t *testing.T) {
	dir := t.TempDir()
	legacy := filepath.Join(dir, FileName)
	if err := os.WriteFile(legacy, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	st := fronted()
	if err := Write(dir, st); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatalf("the Caddyfile beside .env stayed: %v", err)
	}
	written, err := os.ReadFile(Path(dir))
	if err != nil || string(written) != render(t, Sites(st), nil) || Path(dir) != filepath.Join(dir, "caddy", "Caddyfile") {
		t.Fatalf("Caddyfile %q %v", written, err)
	}

	since := time.Date(2026, 11, 11, 10, 0, 0, 0, time.UTC)
	if err := WriteMaintenance(dir, st, since); err != nil {
		t.Fatal(err)
	}
	if page, err := os.ReadFile(PagePath(dir)); err != nil || !strings.Contains(string(page), "<p>Since 10:00 UTC on 11 November 2026</p>") || PagePath(dir) != filepath.Join(dir, "caddy", "maintenance.html") {
		t.Fatalf("the maintenance page %q %v", page, err)
	}
	if !Frozen(dir) {
		t.Fatal("a Caddyfile in maintenance is not seen as one")
	}
	if err := Ensure(dir, st); err != nil {
		t.Fatal(err)
	}
	frozen, err := os.ReadFile(Path(dir))
	if err != nil || !strings.Contains(string(frozen), "Metis-Maintenance \"2026-11-11T10:00:00Z\"") || !strings.Contains(string(frozen), "Metis-Version \"1.4.0\"") {
		t.Fatalf("Ensure replaced a Caddyfile that was there: %q %v", frozen, err)
	}

	if err := os.Remove(Path(dir)); err != nil {
		t.Fatal(err)
	}
	if err := Ensure(dir, st); err != nil {
		t.Fatal(err)
	}
	if restored, err := os.ReadFile(Path(dir)); err != nil || string(restored) != render(t, Sites(st), nil) {
		t.Fatalf("Ensure did not write a missing Caddyfile: %q %v", restored, err)
	}

	if err := Write(dir, state.New()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(Path(dir)); !os.IsNotExist(err) {
		t.Fatalf("the Caddyfile stayed without caddy: %v", err)
	}
	if _, err := os.Stat(PagePath(dir)); !os.IsNotExist(err) {
		t.Fatalf("the maintenance page stayed without caddy: %v", err)
	}
	if err := Ensure(dir, state.New()); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(Path(dir)); !os.IsNotExist(err) {
		t.Fatalf("Ensure wrote a Caddyfile without caddy: %v", err)
	}
}
