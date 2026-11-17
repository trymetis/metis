package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func resendCall(t *testing.T, server *httptest.Server, method, path string, body any, out any) int {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, server.URL+path, reader)
	req.Header.Set("authorization", "Bearer re_e2e")
	req.Header.Set("content-type", "application/json")
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		_ = json.NewDecoder(res.Body).Decode(out)
	}
	return res.StatusCode
}

func TestTheResendFakeSetsUpADomainAndAWebhookTheWayTheCLIDoes(t *testing.T) {
	fake := &resendFake{apiKey: "re_e2e", domain: "updates.demo.trymetis.email", raws: map[string]string{}}
	server := httptest.NewServer(http.HandlerFunc(fake.api))
	defer server.Close()

	var created struct{ ID string }
	if status := resendCall(t, server, http.MethodPost, "/domains", map[string]any{
		"name": "cli.demo.trymetis.email", "region": "us-east-1",
		"capabilities": map[string]string{"sending": "enabled", "receiving": "enabled"},
	}, &created); status != http.StatusOK || created.ID == "" {
		t.Fatalf("create domain: %d %+v", status, created)
	}
	var listed struct {
		Data []struct{ ID, Name, Status string }
	}
	resendCall(t, server, http.MethodGet, "/domains", nil, &listed)
	if len(listed.Data) != 2 || listed.Data[1].Status != "not_started" {
		t.Fatalf("domains: %+v", listed)
	}
	if status := resendCall(t, server, http.MethodPost, "/domains/"+created.ID+"/verify", nil, nil); status != http.StatusOK {
		t.Fatalf("verify: %d", status)
	}
	var domain struct {
		Status       string
		Capabilities struct{ Receiving string }
	}
	resendCall(t, server, http.MethodGet, "/domains/"+created.ID, nil, &domain)
	if domain.Status != "verified" || domain.Capabilities.Receiving != "enabled" {
		t.Fatalf("domain: %+v", domain)
	}

	var hook struct {
		ID            string `json:"id"`
		SigningSecret string `json:"signing_secret"`
	}
	resendCall(t, server, http.MethodPost, "/webhooks", map[string]any{
		"endpoint": "https://resend.cli.localhost/webhooks/resend", "events": []string{"email.received"},
	}, &hook)
	if hook.ID == "" || hook.SigningSecret == "" {
		t.Fatalf("webhook: %+v", hook)
	}
	if status := resendCall(t, server, http.MethodDelete, "/webhooks/"+hook.ID, nil, nil); status != http.StatusOK {
		t.Fatalf("delete webhook: %d", status)
	}
	if status := resendCall(t, server, http.MethodDelete, "/webhooks/"+hook.ID, nil, nil); status != http.StatusNotFound {
		t.Fatalf("second delete: %d", status)
	}
	if len(fake.calls.calls) != 4 {
		t.Fatalf("calls: %+v", fake.calls.calls)
	}
}
