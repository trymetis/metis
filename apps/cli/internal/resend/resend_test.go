package resend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEnsureDomainTurnsOnReceiving(t *testing.T) {
	var patched map[string]any
	receiving := "disabled"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/domains":
			_, _ = w.Write([]byte(`{"data":[{"id":"d1","name":"example.com","status":"verified"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/domains/d1":
			_, _ = w.Write([]byte(`{"id":"d1","name":"example.com","status":"verified","capabilities":{"sending":"enabled","receiving":"` + receiving + `"},"records":[{"record":"Receiving","type":"MX","name":"example.com","value":"inbound.resend.com","priority":10,"status":"verified"}]}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/domains/d1":
			_ = json.NewDecoder(r.Body).Decode(&patched)
			receiving = "enabled"
			_, _ = w.Write([]byte(`{}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	apiOrigin = server.URL
	domain, err := New("re_key").EnsureDomain(context.Background(), "example.com", "us-east-1")
	if err != nil {
		t.Fatal(err)
	}
	if patched == nil || domain.Capabilities.Receiving != "enabled" || domain.Records[0].Type != "MX" || domain.Records[0].Priority != 10 {
		t.Fatalf("domain %+v patched %v", domain, patched)
	}
}

func TestSendingOnlyKeyIsRefused(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"This API key is restricted to only send emails"}`))
	}))
	defer server.Close()
	apiOrigin = server.URL
	_, err := New("re_send").Domains(context.Background())
	if err == nil || !strings.Contains(err.Error(), "full access") {
		t.Fatalf("sending-only key: %v", err)
	}
}
