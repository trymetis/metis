package google

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("client_secret") == "right" {
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_client"}`))
	}))
	defer server.Close()
	tokenURL = server.URL
	ctx := context.Background()
	id := "123-abc" + ClientIDSuffix
	redirect := RedirectURI("https://mail.example.com/")
	if redirect != "https://mail.example.com/api/connections/google/callback" {
		t.Fatalf("redirect %s", redirect)
	}
	if err := CheckClient(ctx, id, "right", redirect); err != nil {
		t.Fatal(err)
	}
	if err := CheckClient(ctx, id, "wrong", redirect); err == nil || !strings.Contains(err.Error(), "does not accept") {
		t.Fatalf("wrong secret: %v", err)
	}
	if err := CheckClient(ctx, "123", "right", redirect); err == nil {
		t.Fatal("an ID without the suffix passed")
	}
}
