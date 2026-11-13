package caddy

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

const FileName = "Caddyfile"

type Site struct {
	Host     string
	Upstream string
}

func StorageHost(domain string) string {
	return "storage." + domain
}

func Sites(st *state.State) []Site {
	if st.Components.Caddy == nil || st.Components.Caddy.Domain == "" {
		return nil
	}
	domain := st.Components.Caddy.Domain
	sites := []Site{{Host: domain, Upstream: "app:3000"}}
	if resend := st.Components.GatewayResend; resend != nil && resend.Host != "" {
		sites = append(sites, Site{Host: resend.Host, Upstream: "gateway-resend:8787"})
	}
	if objstore := st.Components.Objstore; objstore != nil && objstore.Direct {
		sites = append(sites, Site{Host: StorageHost(domain), Upstream: "objstore:9000"})
	}
	return sites
}

func Render(sites []Site) string {
	var out strings.Builder
	for index, site := range sites {
		if index > 0 {
			out.WriteString("\n")
		}
		fmt.Fprintf(&out, "%s {\n\treverse_proxy %s\n}\n", site.Host, site.Upstream)
	}
	return out.String()
}

func Hosts(st *state.State) []string {
	var hosts []string
	for _, site := range Sites(st) {
		hosts = append(hosts, site.Host)
	}
	slices.Sort(hosts)
	return hosts
}

func Write(installDir string, st *state.State) error {
	path := filepath.Join(installDir, FileName)
	sites := Sites(st)
	if len(sites) == 0 {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(Render(sites)), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
