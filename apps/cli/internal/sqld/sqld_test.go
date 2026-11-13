package sqld

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateNamespaces(t *testing.T) {
	var created []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("authorization") != "basic admin-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		name := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/namespaces/"), "/create")
		if name == "mastra" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"Namespace mastra already exists"}`))
			return
		}
		created = append(created, name)
	}))
	defer server.Close()
	addr := strings.TrimPrefix(server.URL, "http://")
	if err := CreateNamespaces(context.Background(), addr, "admin-key", "app", "mastra"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(created, ",") != "app" {
		t.Fatalf("created %v", created)
	}
	if err := CreateNamespaces(context.Background(), addr, "wrong", "app"); err == nil || !strings.Contains(err.Error(), "HTTP 401") {
		t.Fatalf("wrong key: %v", err)
	}
}
