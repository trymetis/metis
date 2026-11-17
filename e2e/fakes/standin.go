package main

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const tlsRoot = "/tls"

type standIn struct {
	name     string
	hosts    []string
	suffixes []string
	ips      bool
	api      http.Handler
	control  *http.ServeMux
	routes   string
}

func (s *standIn) answers(host string) bool {
	for _, exact := range s.hosts {
		if host == exact {
			return true
		}
	}
	for _, suffix := range s.suffixes {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return s.ips && net.ParseIP(host) != nil
}

func requestHost(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

func hostRouter(standIns []*standIn) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := requestHost(r)
		for _, s := range standIns {
			if s.answers(host) {
				s.api.ServeHTTP(w, r)
				return
			}
		}
		writeText(w, http.StatusMisdirectedRequest, fmt.Sprintf("no stand-in answers for %s\n", host))
	})
}

func controlRouter(standIns []*standIn) *http.ServeMux {
	mux := http.NewServeMux()
	healthRoute(mux)
	routes := []string{"GET /health"}
	for _, s := range standIns {
		if s.control == nil {
			continue
		}
		mux.Handle("/"+s.name+"/", http.StripPrefix("/"+s.name, s.control))
		routes = append(routes, s.routes)
	}
	fallback(mux, strings.Join(routes, " | "))
	return mux
}

type certificates struct {
	byName   map[string]*tls.Certificate
	suffixes map[string]*tls.Certificate
	byIP     *tls.Certificate
}

func loadCertificates(root string) (*certificates, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	certs := &certificates{byName: map[string]*tls.Certificate{}, suffixes: map[string]*tls.Certificate{}}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		pair, err := tls.LoadX509KeyPair(filepath.Join(dir, "cert.crt"), filepath.Join(dir, "cert.key"))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", dir, err)
		}
		leaf, err := x509.ParseCertificate(pair.Certificate[0])
		if err != nil {
			return nil, fmt.Errorf("%s: %w", dir, err)
		}
		for _, name := range leaf.DNSNames {
			if rest, ok := strings.CutPrefix(name, "*"); ok {
				certs.suffixes[rest] = &pair
			} else {
				certs.byName[strings.ToLower(name)] = &pair
			}
		}
		if len(leaf.IPAddresses) > 0 {
			certs.byIP = &pair
		}
	}
	if len(certs.byName) == 0 {
		return nil, fmt.Errorf("no certificate under %s", root)
	}
	return certs, nil
}

func (c *certificates) get(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	name := strings.ToLower(hello.ServerName)
	if cert, ok := c.byName[name]; ok {
		return cert, nil
	}
	for suffix, cert := range c.suffixes {
		if strings.HasSuffix(name, suffix) {
			return cert, nil
		}
	}
	if name == "" && c.byIP != nil {
		return c.byIP, nil
	}
	return nil, fmt.Errorf("no certificate for %q", hello.ServerName)
}

type builder func() (*standIn, http.Handler, error)

func plain(build func() *standIn) builder {
	return func() (*standIn, http.Handler, error) { return build(), nil, nil }
}

func checked(build func() (*standIn, error)) builder {
	return func() (*standIn, http.Handler, error) {
		s, err := build()
		return s, nil, err
	}
}

var builders = map[string]builder{
	"resend":     checked(newResend),
	"ses":        newSes,
	"mcp-client": plain(newMcpClient),
	"updater":    checked(newUpdater),
	"sh":         plain(newSh),
	"github-raw": plain(newGithubRaw),
	"cloudflare": checked(newCloudflare),
	"registry":   checked(newRegistry),
}

func runServe() error {
	env, err := requireEnv("FAKES")
	if err != nil {
		return err
	}
	var standIns []*standIn
	var names []string
	var functionURL http.Handler
	cron := false
	for name := range strings.SplitSeq(env["FAKES"], ",") {
		name = strings.TrimSpace(name)
		if name == "cron" {
			cron = true
			continue
		}
		build, ok := builders[name]
		if !ok {
			return fmt.Errorf("FAKES names %q, which is not a stand-in", name)
		}
		s, extra, err := build()
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if extra != nil {
			functionURL = extra
		}
		standIns = append(standIns, s)
		names = append(names, name)
	}
	certs, err := loadCertificates(tlsRoot)
	if err != nil {
		return err
	}

	errs := make(chan error, 4)
	go func() {
		srv := &http.Server{
			Addr:              ":443",
			Handler:           hostRouter(standIns),
			TLSConfig:         &tls.Config{GetCertificate: certs.get, MinVersion: tls.VersionTLS12},
			TLSNextProto:      map[string]func(*http.Server, *tls.Conn, http.Handler){},
			ReadHeaderTimeout: serverHeaderTimeout,
			IdleTimeout:       serverIdleTimeout,
		}
		errs <- srv.ListenAndServeTLS("", "")
	}()
	go func() { errs <- serve(":8080", controlRouter(standIns)) }()
	if functionURL != nil {
		go func() { errs <- serve(":8081", functionURL) }()
	}
	if cron {
		go func() { errs <- runCron() }()
	}
	log.Printf("[fakes] %s on :443 by host name, control on :8080", strings.Join(names, ", "))
	err = <-errs
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
