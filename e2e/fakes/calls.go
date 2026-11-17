package main

import (
	"net/http"
	"sync"
	"time"
)

type call struct {
	Service string            `json:"service"`
	Action  string            `json:"action"`
	Target  string            `json:"target"`
	Detail  map[string]string `json:"detail,omitempty"`
	At      string            `json:"at"`
}

type callLog struct {
	mu    sync.Mutex
	calls []call
}

func (l *callLog) add(service, action, target string, detail map[string]string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.calls = append(l.calls, call{
		Service: service, Action: action, Target: target, Detail: detail,
		At: time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (l *callLog) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /calls", func(w http.ResponseWriter, _ *http.Request) {
		l.mu.Lock()
		defer l.mu.Unlock()
		list := l.calls
		if list == nil {
			list = []call{}
		}
		writeJSON(w, http.StatusOK, list)
	})
	mux.HandleFunc("DELETE /calls", func(w http.ResponseWriter, _ *http.Request) {
		l.mu.Lock()
		l.calls = nil
		l.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
}
