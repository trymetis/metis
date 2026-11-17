package main

import (
	"strings"
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

func TestExportDomain(t *testing.T) {
	for raw, want := range map[string]string{
		"https://mail.example.com":     "mail.example.com",
		"https://mail.example.com:443": "mail.example.com",
		"http://localhost:3000":        "",
		"http://127.0.0.1:3000":        "",
		"":                             "",
	} {
		if got := exportDomain(raw); got != want {
			t.Fatalf("%q: %q, want %q", raw, got, want)
		}
	}
}

func TestFromExportReleaseAndEnvironment(t *testing.T) {
	boot, err := export.ParseEnv("BETTER_AUTH_URL=https://mail.example.com\nMETIS_ENCRYPTION_KEY=kept\nMETIS_DOMAIN=mail.example.com\n")
	if err != nil {
		t.Fatal(err)
	}
	fx := &fromExport{meta: &archive.Metadata{Header: archive.Header{AppVersion: "1.4.0"}}, boot: boot}
	if err := fx.checkRelease("1.3.9"); err == nil || err.Error() != "This export needs Metis 1.4.0 or later; run sudo metis self-update" {
		t.Fatalf("older release: %v", err)
	}
	if err := fx.checkRelease("1.4.0"); err != nil {
		t.Fatal(err)
	}
	env, _ := envfile.Parse("")
	fx.applyTo(env)
	if env.Value("METIS_ENCRYPTION_KEY") != "kept" || env.Value("BETTER_AUTH_URL") != "https://mail.example.com" {
		t.Fatalf("env %v", env.Map())
	}
}

func TestStoredRecipients(t *testing.T) {
	private, _ := keys.Generate()
	pem, _ := keys.MarshalPublic(private.PublicKey(), nil)
	st := state.New()
	st.ExportRecipients = []string{string(pem)}
	recipients, err := storedRecipients(st)
	if err != nil || len(recipients) != 1 || keys.Fingerprint(recipients[0].Key) != keys.Fingerprint(private.PublicKey()) {
		t.Fatalf("recipients %v %v", recipients, err)
	}
	st.ExportRecipients = []string{"not a key"}
	if _, err := storedRecipients(st); err == nil || !strings.Contains(err.Error(), "does not parse") {
		t.Fatalf("err %v", err)
	}
	if err := validRecipientFile(""); err != nil {
		t.Fatal(err)
	}
}
