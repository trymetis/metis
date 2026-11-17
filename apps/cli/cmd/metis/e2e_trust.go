//go:build e2e

//go:debug x509usefallbackroots=1
package main

import (
	"crypto/x509"
	"encoding/base64"
	"log"
)

var e2eCA string

func init() {
	pem, err := base64.StdEncoding.DecodeString(e2eCA)
	if err != nil || len(pem) == 0 {
		log.Fatalf("[e2e] this build needs -X main.e2eCA set to the base64 of e2e/tls/ca.crt")
	}
	roots, err := x509.SystemCertPool()
	if err != nil || roots == nil {
		roots = x509.NewCertPool()
	}
	if !roots.AppendCertsFromPEM(pem) {
		log.Fatalf("[e2e] -X main.e2eCA holds no certificate")
	}
	x509.SetFallbackRoots(roots)
}
