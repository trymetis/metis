package catalog

import (
	"context"
	"strings"
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

func fullState() *state.State {
	st := state.New()
	st.App = state.App{Version: "1.4.0", Images: state.Images{
		App:       "ghcr.io/trymetis/metis:1.4.0",
		Preflight: "ghcr.io/trymetis/metis:1.4.0-preflight",
		Worker:    "ghcr.io/trymetis/metis:1.4.0-worker",
	}}
	st.Components = state.Components{
		Sqld:          &state.Sqld{},
		Caddy:         &state.Caddy{Domain: "mail.example.com"},
		Updater:       &state.UpdaterComponent{Mode: state.UpdaterDocker},
		Worker:        &state.Worker{Replicas: 2},
		Redis:         &state.Redis{},
		Objstore:      &state.Objstore{DataDir: "/srv/metis-objstore"},
		GatewayResend: &state.GatewayResend{Domain: "example.com", Database: "own", Version: "1.3.0"},
	}
	return st
}

func names(catalog *Catalog) string {
	var out []string
	for _, service := range catalog.Services {
		out = append(out, service.Name)
	}
	return strings.Join(out, ",")
}

func TestLoadEveryComponent(t *testing.T) {
	catalog, err := Load(context.Background(), fullState(), "/opt/metis-suite", map[string]string{"SQLD_AUTH_JWT_KEY": "jwt", "SQLD_ADMIN_KEY": "admin"})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := names(catalog), strings.Join(Order, ","); got != want {
		t.Fatalf("services %s, want %s", got, want)
	}
	sqld, _ := catalog.Service("sqld")
	if value := sqld.Config.Environment["LIBSQL_ADMIN_AUTH_KEY"]; value == nil || *value != "admin" {
		t.Fatalf("sqld admin key %v", value)
	}
	if !strings.Contains(strings.Join(sqld.Config.HealthCheck.Test, " "), "$status") {
		t.Fatalf("healthcheck %v", sqld.Config.HealthCheck.Test)
	}
	resend, _ := catalog.Service("gateway-resend")
	if resend.Config.Image != "ghcr.io/trymetis/metis-gateway-resend:1.3.0" {
		t.Fatalf("resend image %s", resend.Config.Image)
	}
	objstore, _ := catalog.Service("objstore")
	if source := objstore.Config.Volumes[0]; source.Type != "bind" || source.Source != "/srv/metis-objstore" {
		t.Fatalf("objstore volume %+v", source)
	}
	worker, _ := catalog.Service("worker")
	if worker.Replicas != 2 {
		t.Fatalf("worker replicas %d", worker.Replicas)
	}
	app, _ := catalog.Service("app")
	if app.Config.Volumes[0].Source != UpdaterVolume || app.Config.Volumes[0].Type != "volume" {
		t.Fatalf("app updater mount %+v", app.Config.Volumes[0])
	}
	if app.Config.Ports[0].Published != "3000" || app.Config.Ports[0].HostIP != "127.0.0.1" {
		t.Fatalf("app port %+v", app.Config.Ports[0])
	}
}

func TestLoadMinimal(t *testing.T) {
	st := fullState()
	st.Components = state.Components{Sqld: &state.Sqld{}, Updater: &state.UpdaterComponent{Mode: state.UpdaterSystemd}}
	catalog, err := Load(context.Background(), st, "/opt/metis-suite", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := names(catalog); got != "sqld,preflight,app" {
		t.Fatalf("services %s", got)
	}
	app, _ := catalog.Service("app")
	if mount := app.Config.Volumes[0]; mount.Type != "bind" || mount.Source != UpdaterSocket {
		t.Fatalf("app updater mount %+v", mount)
	}
	st.Components.Updater = nil
	catalog, err = Load(context.Background(), st, "/opt/metis-suite", nil)
	if err != nil {
		t.Fatal(err)
	}
	app, _ = catalog.Service("app")
	if len(app.Config.Volumes) != 0 || app.Config.Environment["METIS_UPDATER_SOCKET"] != nil {
		t.Fatalf("app without updater %+v %+v", app.Config.Volumes, app.Config.Environment)
	}
}

func TestPins(t *testing.T) {
	pins, err := Pins()
	if err != nil {
		t.Fatal(err)
	}
	if len(pins) != 5 {
		t.Fatalf("pins %v", pins)
	}
	for _, pin := range pins {
		if !strings.Contains(pin, "@sha256:") {
			t.Fatalf("%s is not pinned by digest", pin)
		}
	}
}
