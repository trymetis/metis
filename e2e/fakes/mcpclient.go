package main

import (
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	mcpPublicHost  = "mcp.quillmate.app"
	mcpRedirectURI = "http://127.0.0.1:47801/callback"
)

var mcpDocumentPath = regexp.MustCompile(`^/clients/([a-z0-9-]{1,64})\.json$`)

type clientDocument struct {
	ClientID                string   `json:"client_id"`
	ClientName              string   `json:"client_name"`
	ClientURI               string   `json:"client_uri"`
	RedirectURIs            []string `json:"redirect_uris"`
	GrantTypes              []string `json:"grant_types"`
	ResponseTypes           []string `json:"response_types"`
	TokenEndpointAuthMethod string   `json:"token_endpoint_auth_method"`
	SoftwareStatement       string   `json:"software_statement,omitempty"`
}

type documentHit struct {
	Path string `json:"path"`
	At   string `json:"at"`
}

type mcpClientFake struct {
	mu   sync.Mutex
	hits []documentHit
}

func requestPath(r *http.Request) string {
	if r.URL.RawQuery == "" {
		return r.URL.Path
	}
	return r.URL.Path + "?" + r.URL.RawQuery
}

func (f *mcpClientFake) document(w http.ResponseWriter, r *http.Request) {
	match := mcpDocumentPath.FindStringSubmatch(r.URL.Path)
	if match == nil {
		writeText(w, http.StatusNotFound, "not found\n")
		return
	}
	f.mu.Lock()
	f.hits = append(f.hits, documentHit{
		Path: requestPath(r),
		At:   time.Now().UTC().Format(time.RFC3339Nano),
	})
	f.mu.Unlock()

	name := match[1]
	doc := clientDocument{
		ClientID:                fmt.Sprintf("https://%s%s", r.Host, requestPath(r)),
		ClientName:              "Quillmate " + name,
		ClientURI:               "https://" + mcpPublicHost,
		RedirectURIs:            []string{mcpRedirectURI},
		GrantTypes:              []string{"authorization_code", "refresh_token"},
		ResponseTypes:           []string{"code"},
		TokenEndpointAuthMethod: "none",
	}
	if cache := r.URL.Query().Get("cache"); cache != "" {
		w.Header().Set("cache-control", cache)
	}

	switch name {
	case "broken-mismatch":
		doc.ClientID = fmt.Sprintf("https://%s/clients/someone-else.json", mcpPublicHost)
	case "broken-oversize":
		doc.SoftwareStatement = strings.Repeat("x", 6*1024)
	case "broken-redirect":
		http.Redirect(w, r, fmt.Sprintf("https://%s/clients/redirected.json", r.Host), http.StatusFound)
		return
	case "broken-slow":
		time.Sleep(6 * time.Second)
	case "broken-content-type":
		w.Header().Del("cache-control")
		writeJSONAs(w, "text/plain", doc)
		return
	case "broken-secret":
		doc.TokenEndpointAuthMethod = "client_secret_basic"
	case "foreign-redirect":
		doc.RedirectURIs = []string{"https://callback.example.org/oauth"}
	}
	writeJSON(w, http.StatusOK, doc)
}

func runMcpClient() error {
	fake := &mcpClientFake{hits: []documentHit{}}

	control := http.NewServeMux()
	healthRoute(control)
	control.HandleFunc("GET /hits", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		writeJSON(w, http.StatusOK, fake.hits)
	})
	control.HandleFunc("DELETE /hits", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		fake.hits = []documentHit{}
		fake.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	fallback(control, "GET /health | GET, DELETE /hits")

	errs := make(chan error, 2)
	go func() {
		errs <- serveTLS(":443", http.HandlerFunc(fake.document),
			"/tls/mcp-client/mcp-client.crt", "/tls/mcp-client/mcp-client.key")
	}()
	go func() { errs <- serve(":8080", control) }()
	log.Printf("[mcp-client] documents at https://%s/clients/<name>.json, hits on :8080", mcpPublicHost)
	return firstError(errs)
}
