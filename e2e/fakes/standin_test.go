package main

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTheHostRouterPicksTheStandInByHostName(t *testing.T) {
	hit := func(name string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { writeText(w, http.StatusOK, name) })
	}
	router := hostRouter([]*standIn{
		{name: "resend", hosts: []string{"api.resend.com"}, api: hit("resend")},
		{name: "ses", hosts: []string{"email.us-east-1.amazonaws.com"}, suffixes: []string{".s3.us-east-1.amazonaws.com"}, api: hit("ses")},
		{name: "registry", hosts: []string{"ghcr.io"}, ips: true, api: hit("registry")},
	})
	for host, want := range map[string]string{
		"api.resend.com":                    "resend",
		"api.resend.com:443":                "resend",
		"bucket.s3.us-east-1.amazonaws.com": "ses",
		"ghcr.io":                           "registry",
		"127.0.0.1:5443":                    "registry",
		"unknown.example.org":               "no stand-in answers for unknown.example.org\n",
	} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Body.String() != want {
			t.Errorf("%s went to %q, want %q", host, rec.Body.String(), want)
		}
	}
}

func TestEveryStandInHostHasACertificate(t *testing.T) {
	certs, err := loadCertificates("../tls")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{
		"api.resend.com", "email.us-east-1.amazonaws.com", "sts.us-east-1.amazonaws.com", "iam.amazonaws.com",
		"sqs.us-east-1.amazonaws.com", "lambda.us-east-1.amazonaws.com",
		"metis-ses-aws-demo-trymetis-email.s3.us-east-1.amazonaws.com", "mcp.quillmate.app",
		"mcp-private.quillmate.app", "sh.trymetis.email", "raw.githubusercontent.com", "api.cloudflare.com",
		"ghcr.io", "registry-1.docker.io", "gcr.io", "registry.localhost", "",
	} {
		if _, err := certs.get(&tls.ClientHelloInfo{ServerName: name}); err != nil {
			t.Errorf("%q: %v", name, err)
		}
	}
}
