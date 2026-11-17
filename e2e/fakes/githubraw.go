package main

import (
	"net/http"
	"strings"
)

func newGithubRaw() *standIn {
	const root = "/repo"
	const prefix = "/trymetis/metis/"
	files := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rest, ok := strings.CutPrefix(r.URL.Path, prefix)
		_, file, found := strings.Cut(rest, "/")
		if !ok || !found || r.Method != http.MethodGet || strings.Contains(file, "..") {
			writeText(w, http.StatusNotFound, "404: Not Found")
			return
		}
		serveFile(w, r, root, file)
	})
	return &standIn{name: "github-raw", hosts: []string{"raw.githubusercontent.com"}, api: files}
}
