package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestServeFileServesOnlyFilesUnderTheRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "cli"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "cli", "SHA256SUMS"), []byte("abc  metis-linux-amd64\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]int{
		"/cli/SHA256SUMS":        http.StatusOK,
		"/cli/missing":           http.StatusNotFound,
		"/cli":                   http.StatusNotFound,
		"/../../etc/passwd":      http.StatusNotFound,
		"/cli/../cli/SHA256SUMS": http.StatusOK,
	} {
		recorder := httptest.NewRecorder()
		serveFile(recorder, httptest.NewRequest(http.MethodGet, "/", nil), root, path)
		if recorder.Code != want {
			t.Errorf("%s answered %d, want %d", path, recorder.Code, want)
		}
	}
	recorder := httptest.NewRecorder()
	serveFile(recorder, httptest.NewRequest(http.MethodGet, "/", nil), root, "/cli/SHA256SUMS")
	if got := recorder.Header().Get("content-type"); got != "text/plain; charset=utf-8" {
		t.Errorf("content type %q", got)
	}
}
