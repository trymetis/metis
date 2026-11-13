package catalog

import (
	"context"
	_ "embed"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/compose-spec/compose-go/v2/loader"
	"github.com/compose-spec/compose-go/v2/types"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

//go:embed services.yml
var servicesYAML []byte

const (
	Network        = "metis"
	UpdaterSocket  = "/run/metis-updater"
	UpdaterVolume  = "metis-updater"
	ObjstoreVolume = "metis-objstore"
	ResendImage    = "ghcr.io/trymetis/metis-gateway-resend"
)

var Order = []string{
	"sqld",
	"sqld-resend",
	"redis",
	"objstore",
	"preflight",
	"app",
	"worker",
	"gateway-resend",
	"caddy",
	"updater",
}

var components = map[string]string{
	"sqld":           "sqld",
	"sqld-resend":    "gateway-resend",
	"preflight":      "app",
	"app":            "app",
	"worker":         "worker",
	"redis":          "redis",
	"objstore":       "objstore",
	"gateway-resend": "gateway-resend",
	"caddy":          "caddy",
	"updater":        "updater",
}

type Service struct {
	Name      string
	Component string
	OneShot   bool
	Replicas  int
	Config    types.ServiceConfig
}

type Catalog struct {
	Services []Service
	Volumes  map[string]string
}

func (catalog *Catalog) Service(name string) (Service, bool) {
	for _, service := range catalog.Services {
		if service.Name == name {
			return service, true
		}
	}
	return Service{}, false
}

func Environment(st *state.State, installDir string, dotenv map[string]string) map[string]string {
	env := map[string]string{}
	for key, value := range dotenv {
		env[key] = value
	}
	socket := UpdaterVolume
	if updater := st.Components.Updater; updater != nil && updater.Mode == state.UpdaterSystemd {
		socket = UpdaterSocket
	}
	objstore := ObjstoreVolume
	if st.Components.Objstore != nil && st.Components.Objstore.DataDir != "" {
		objstore = st.Components.Objstore.DataDir
	}
	resendVersion := st.App.Version
	if st.Components.GatewayResend != nil && st.Components.GatewayResend.Version != "" {
		resendVersion = st.Components.GatewayResend.Version
	}
	for key, value := range map[string]string{
		"APP_IMAGE":              st.App.Images.App,
		"PREFLIGHT_IMAGE":        st.App.Images.Preflight,
		"WORKER_IMAGE":           st.App.Images.Worker,
		"GATEWAY_RESEND_VERSION": resendVersion,
		"APP_PORT":               strconv.Itoa(st.AppPort),
		"METIS_INSTALL_DIR":      installDir,
		"UPDATER_SOCKET_SOURCE":  socket,
		"OBJSTORE_DATA":          objstore,
	} {
		env[key] = value
	}
	return env
}

func load(ctx context.Context, env map[string]string) (*types.Project, error) {
	return loader.LoadWithContext(ctx, types.ConfigDetails{
		WorkingDir:  "/",
		ConfigFiles: []types.ConfigFile{{Filename: "services.yml", Content: servicesYAML}},
		Environment: env,
	}, func(options *loader.Options) {
		options.SkipResolveEnvironment = true
		options.SkipConsistencyCheck = false
		options.SetProjectName("metis", true)
	})
}

func enabled(st *state.State, name string) bool {
	components := st.Components
	switch name {
	case "sqld":
		return components.Sqld != nil
	case "sqld-resend":
		return components.GatewayResend != nil && components.GatewayResend.Database == "own"
	case "preflight", "app":
		return true
	case "worker":
		return components.Worker != nil
	case "redis":
		return components.Redis != nil
	case "objstore":
		return components.Objstore != nil
	case "gateway-resend":
		return components.GatewayResend != nil
	case "caddy":
		return components.Caddy != nil
	case "updater":
		return components.Updater != nil && components.Updater.Mode == state.UpdaterDocker
	}
	return false
}

func Load(ctx context.Context, st *state.State, installDir string, dotenv map[string]string) (*Catalog, error) {
	project, err := load(ctx, Environment(st, installDir, dotenv))
	if err != nil {
		return nil, fmt.Errorf("[catalog] %w", err)
	}
	catalog := &Catalog{Volumes: map[string]string{}}
	for key, volume := range project.Volumes {
		catalog.Volumes[key] = volume.Name
	}
	for _, name := range Order {
		if !enabled(st, name) {
			continue
		}
		config, ok := project.Services[name]
		if !ok {
			return nil, fmt.Errorf("[catalog] services.yml has no %s service", name)
		}
		if name == "app" && st.Components.Updater == nil {
			delete(config.Environment, "METIS_UPDATER_SOCKET")
			config.Volumes = slices.DeleteFunc(config.Volumes, func(volume types.ServiceVolumeConfig) bool {
				return volume.Target == UpdaterSocket
			})
		}
		service := Service{Name: name, Component: components[name], OneShot: name == "preflight", Replicas: 1, Config: config}
		if name == "worker" {
			service.Replicas = max(st.Components.Worker.Replicas, 1)
		}
		catalog.Services = append(catalog.Services, service)
	}
	return catalog, nil
}

func Pins() ([]string, error) {
	model, err := loader.LoadModelWithContext(context.Background(), types.ConfigDetails{
		WorkingDir:  "/",
		ConfigFiles: []types.ConfigFile{{Filename: "services.yml", Content: servicesYAML}},
		Environment: map[string]string{},
	}, func(options *loader.Options) {
		options.SkipInterpolation = true
		options.SkipValidation = true
		options.SkipNormalization = true
		options.SkipConsistencyCheck = true
		options.SetProjectName("metis", true)
	})
	if err != nil {
		return nil, err
	}
	services, _ := model["services"].(map[string]any)
	var pins []string
	for _, name := range Order {
		service, _ := services[name].(map[string]any)
		image, _ := service["image"].(string)
		if image != "" && !strings.Contains(image, "$") && !slices.Contains(pins, image) {
			pins = append(pins, image)
		}
	}
	return pins, nil
}

func ComponentOf(service string) string {
	return components[service]
}
