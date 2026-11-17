package caddy

import (
	_ "embed"
	"encoding/json"
	"fmt"
	htmltemplate "html/template"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"text/template"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

const (
	Folder      = "caddy"
	FileName    = "Caddyfile"
	PageName    = "maintenance.html"
	MountPath   = "/etc/caddy"
	AppUpstream = "app:3000"
	sinceLayout = "15:04 UTC on 2 January 2006"
	frozenMark  = "\theader Metis-Maintenance "
)

//go:embed Caddyfile.tmpl
var caddyfileSource string

//go:embed maintenance.html
var pageSource string

var (
	caddyfileTemplate = template.Must(template.New(FileName).Parse(caddyfileSource))
	pageTemplate      = htmltemplate.Must(htmltemplate.New(PageName).Parse(pageSource))
)

type Site struct {
	Host     string
	Upstream string
}

type Window struct {
	Since   time.Time
	Version string
}

type siteView struct {
	Site
	Frozen bool
}

type caddyfileView struct {
	Sites   []siteView
	Since   string
	Version string
	Body    string
	Root    string
	Page    string
}

type maintenanceBody struct {
	Error string `json:"error"`
	Since string `json:"since"`
}

func StorageHost(domain string) string {
	return "storage." + domain
}

func Fronts(st *state.State) bool {
	return st.Components.Caddy != nil && st.Components.Caddy.Domain != ""
}

func Path(installDir string) string {
	return filepath.Join(installDir, Folder, FileName)
}

func PagePath(installDir string) string {
	return filepath.Join(installDir, Folder, PageName)
}

func Sites(st *state.State) []Site {
	if !Fronts(st) {
		return nil
	}
	domain := st.Components.Caddy.Domain
	sites := []Site{{Host: domain, Upstream: AppUpstream}}
	if resend := st.Components.GatewayResend; resend != nil && resend.Host != "" {
		sites = append(sites, Site{Host: resend.Host, Upstream: "gateway-resend:8787"})
	}
	if objstore := st.Components.Objstore; objstore != nil && objstore.Direct {
		sites = append(sites, Site{Host: StorageHost(domain), Upstream: "objstore:9000"})
	}
	return sites
}

func Render(sites []Site, window *Window) (string, error) {
	view := caddyfileView{Root: MountPath, Page: PageName}
	for _, site := range sites {
		view.Sites = append(view.Sites, siteView{Site: site, Frozen: window != nil && site.Upstream == AppUpstream})
	}
	if window != nil {
		view.Since = window.Since.UTC().Format(time.RFC3339)
		view.Version = window.Version
		body, err := json.Marshal(maintenanceBody{Error: "maintenance", Since: view.Since})
		if err != nil {
			return "", err
		}
		view.Body = string(body)
	}
	var out strings.Builder
	if err := caddyfileTemplate.Execute(&out, view); err != nil {
		return "", fmt.Errorf("rendering the Caddyfile: %w", err)
	}
	return out.String(), nil
}

func Page(window Window) (string, error) {
	var out strings.Builder
	view := struct{ Since string }{Since: window.Since.UTC().Format(sinceLayout)}
	if err := pageTemplate.Execute(&out, view); err != nil {
		return "", fmt.Errorf("rendering the maintenance page: %w", err)
	}
	return out.String(), nil
}

func Hosts(st *state.State) []string {
	var hosts []string
	for _, site := range Sites(st) {
		hosts = append(hosts, site.Host)
	}
	slices.Sort(hosts)
	return hosts
}

func replace(path, content string) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func remove(path string) error {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func write(installDir string, st *state.State, window *Window) error {
	if err := remove(filepath.Join(installDir, FileName)); err != nil {
		return err
	}
	sites := Sites(st)
	if len(sites) == 0 {
		if err := remove(PagePath(installDir)); err != nil {
			return err
		}
		return remove(Path(installDir))
	}
	if err := os.MkdirAll(filepath.Join(installDir, Folder), 0o755); err != nil {
		return err
	}
	if window != nil {
		page, err := Page(*window)
		if err != nil {
			return err
		}
		if err := replace(PagePath(installDir), page); err != nil {
			return err
		}
	}
	caddyfile, err := Render(sites, window)
	if err != nil {
		return err
	}
	return replace(Path(installDir), caddyfile)
}

func Write(installDir string, st *state.State) error {
	return write(installDir, st, nil)
}

func WriteMaintenance(installDir string, st *state.State, since time.Time) error {
	return write(installDir, st, &Window{Since: since, Version: st.App.Version})
}

func Frozen(installDir string) bool {
	content, err := os.ReadFile(Path(installDir))
	return err == nil && strings.Contains(string(content), frozenMark)
}

func Ensure(installDir string, st *state.State) error {
	if !Fronts(st) {
		return nil
	}
	if _, err := os.Stat(Path(installDir)); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return Write(installDir, st)
}
