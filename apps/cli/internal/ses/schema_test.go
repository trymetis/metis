package ses

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPipelineURL(t *testing.T) {
	for input, want := range map[string]string{
		"libsql://db-acme.turso.io": "https://db-acme.turso.io/v2/pipeline",
		"https://sqld.example.com/": "https://sqld.example.com/v2/pipeline",
		"ws://127.0.0.1:8080":       "http://127.0.0.1:8080/v2/pipeline",
	} {
		if got := pipelineURL(input); got != want {
			t.Fatalf("%s: %s", input, got)
		}
	}
}

func TestApplySchema(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/pipeline" || r.Header.Get("Authorization") != "Bearer token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"results":[{"type":"ok"},{"type":"ok"}]}`))
	}))
	defer server.Close()
	if err := ApplySchema(context.Background(), server.URL, "token", "CREATE TABLE t (id TEXT);"); err != nil {
		t.Fatal(err)
	}
	requests := got["requests"].([]any)
	if first := requests[0].(map[string]any); first["type"] != "sequence" || first["sql"] != "CREATE TABLE t (id TEXT);" {
		t.Fatalf("request %v", got)
	}
}
