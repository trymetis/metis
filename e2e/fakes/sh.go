package main

import (
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func contentType(name string) string {
	switch {
	case strings.HasSuffix(name, "SHA256SUMS"), strings.HasSuffix(name, ".txt"), name == "bootstrap":
		return "text/plain; charset=utf-8"
	case strings.HasSuffix(name, ".md"):
		return "text/markdown; charset=utf-8"
	case strings.HasSuffix(name, ".json"):
		return "application/json"
	}
	if byExtension := mime.TypeByExtension(filepath.Ext(name)); byExtension != "" {
		return byExtension
	}
	return "application/octet-stream"
}

func serveFile(w http.ResponseWriter, r *http.Request, root, name string) {
	clean := path.Clean("/" + name)
	file := filepath.Join(root, filepath.FromSlash(clean))
	info, err := os.Stat(file)
	if err != nil || info.IsDir() {
		writeText(w, http.StatusNotFound, "not found\n")
		return
	}
	w.Header().Set("content-type", contentType(path.Base(clean)))
	http.ServeFile(w, r, file)
}

func newSh() *standIn {
	const root = "/srv/sh"
	if err := os.MkdirAll(root, 0o755); err != nil {
		log.Printf("[sh] %v", err)
	}
	files := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeText(w, http.StatusMethodNotAllowed, "GET only\n")
			return
		}
		serveFile(w, r, root, r.URL.Path)
	})
	return &standIn{name: "sh", hosts: []string{"sh.trymetis.email"}, api: files}
}
