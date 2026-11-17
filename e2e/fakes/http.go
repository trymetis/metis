package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json;charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONAs(w http.ResponseWriter, contentType string, body any) {
	w.Header().Set("content-type", contentType)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(body)
}

func writeText(w http.ResponseWriter, status int, text string) {
	w.Header().Set("content-type", "text/plain;charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(text))
}

func healthRoute(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeText(w, http.StatusOK, "ok\n")
	})
}

func fallback(mux *http.ServeMux, routes string) {
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeText(w, http.StatusNotFound, routes+"\n")
	})
}

const (
	serverHeaderTimeout = 10 * time.Second
	serverIdleTimeout   = 30 * time.Second
)

func serve(addr string, handler http.Handler) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return srv.ListenAndServe()
}

func firstError(errs <-chan error) error {
	err := <-errs
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func requireEnv(names ...string) (map[string]string, error) {
	values := make(map[string]string, len(names))
	var missing []string
	for _, name := range names {
		value := os.Getenv(name)
		if value == "" {
			missing = append(missing, name)
		}
		values[name] = value
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("%v are required", missing)
	}
	return values, nil
}

func runHealth(args []string) error {
	if len(args) != 1 {
		return errors.New("health takes one URL")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	res, err := client.Get(args[0])
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("%s answered %d", args[0], res.StatusCode)
	}
	return nil
}
