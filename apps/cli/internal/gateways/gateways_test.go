package gateways

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func zipOf(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	for name, content := range files {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = file.Write([]byte(content))
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestArtifactChecksAndCaches(t *testing.T) {
	archive := zipOf(t, map[string]string{"index.js": "export default {}"})
	sum := sha256.Sum256(archive)
	sums := hex.EncodeToString(sum[:]) + "  gateway-cloudflare.zip\n"
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		switch r.URL.Path {
		case "/v1.4.0/SHA256SUMS":
			_, _ = w.Write([]byte(sums))
		case "/v1.4.0/gateway-cloudflare.zip":
			_, _ = w.Write(archive)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	bucketOrigin = server.URL
	cache := t.TempDir()
	body, err := Artifact(context.Background(), "1.4.0", "gateway-cloudflare.zip", cache)
	if err != nil {
		t.Fatal(err)
	}
	module, err := ZipFile(body, "index.js")
	if err != nil || string(module) != "export default {}" {
		t.Fatalf("module %q %v", module, err)
	}
	requests = 0
	if _, err := Artifact(context.Background(), "1.4.0", "gateway-cloudflare.zip", cache); err != nil || requests != 1 {
		t.Fatalf("cached download made %d requests: %v", requests, err)
	}
	sums = strings.Repeat("0", 64) + "  gateway-cloudflare.zip\n"
	if _, err := Artifact(context.Background(), "1.4.0", "gateway-cloudflare.zip", ""); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("a tampered zip: %v", err)
	}
}

func TestSlug(t *testing.T) {
	if Slug("Mail.Example.COM") != "mail-example-com" || NormalizeDomain(" Example.org. ") != "example.org" {
		t.Fatal("slug")
	}
}

func TestTokens(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/tokens" || r.Header.Get("Authorization") != "Bearer admin" {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"Token management needs the admin API_TOKEN"}`))
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch r.Method {
		case http.MethodPost:
			_, _ = w.Write([]byte(`{"address":"` + body["address"] + `","token":"mbx_1"}`))
		case http.MethodGet:
			_, _ = w.Write([]byte(`{"tokens":[{"address":"alice@example.com"}]}`))
		case http.MethodDelete:
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	}))
	defer server.Close()
	ctx := context.Background()
	if token, err := CreateToken(ctx, server.URL+"/", "admin", "alice@example.com"); err != nil || token != "mbx_1" {
		t.Fatalf("create %q %v", token, err)
	}
	if tokens, err := ListTokens(ctx, server.URL, "admin"); err != nil || len(tokens) != 1 {
		t.Fatalf("list %v %v", tokens, err)
	}
	if err := RevokeToken(ctx, server.URL, "admin", "alice@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := ListTokens(ctx, server.URL, "wrong"); err == nil || !strings.Contains(err.Error(), "needs the admin API_TOKEN") {
		t.Fatalf("wrong token: %v", err)
	}
}
