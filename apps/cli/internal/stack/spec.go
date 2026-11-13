package stack

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/netip"
	"slices"
	"time"

	"github.com/compose-spec/compose-go/v2/types"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"

	"github.com/trymetis/metis/apps/cli/internal/catalog"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
)

const (
	LabelManaged   = "email.trymetis.managed"
	LabelComponent = "email.trymetis.component"
	LabelSpec      = "email.trymetis.spec"
	prefix         = "metis-"
)

type Spec struct {
	Name      string
	Service   string
	Component string
	OneShot   bool
	Config    *container.Config
	Host      *container.HostConfig
	Network   *network.NetworkingConfig
	EnvFiles  []string
}

func ContainerName(service string, replica int) string {
	if service == "worker" {
		return fmt.Sprintf("%sworker-%d", prefix, replica)
	}
	return prefix + service
}

func readEnv(service types.ServiceConfig, overrides map[string]string) ([]string, []string, error) {
	values := map[string]string{}
	var files []string
	for _, file := range service.EnvFiles {
		parsed, err := envfile.Read(file.Path)
		if err != nil {
			return nil, nil, err
		}
		files = append(files, file.Path)
		for key, value := range parsed.Map() {
			values[key] = value
		}
	}
	for key, value := range service.Environment {
		if value != nil {
			values[key] = *value
		}
	}
	for key, value := range overrides {
		values[key] = value
	}
	env := make([]string, 0, len(values))
	for key, value := range values {
		env = append(env, key+"="+value)
	}
	slices.Sort(env)
	return env, files, nil
}

func ports(service types.ServiceConfig) (network.PortSet, network.PortMap, error) {
	exposed := network.PortSet{}
	bindings := network.PortMap{}
	for _, port := range service.Ports {
		protocol := port.Protocol
		if protocol == "" {
			protocol = "tcp"
		}
		key, err := network.ParsePort(fmt.Sprintf("%d/%s", port.Target, protocol))
		if err != nil {
			return nil, nil, err
		}
		exposed[key] = struct{}{}
		binding := network.PortBinding{HostPort: port.Published}
		if port.HostIP != "" {
			if binding.HostIP, err = netip.ParseAddr(port.HostIP); err != nil {
				return nil, nil, err
			}
		}
		bindings[key] = append(bindings[key], binding)
	}
	return exposed, bindings, nil
}

func mounts(service types.ServiceConfig, volumes map[string]string) []mount.Mount {
	var out []mount.Mount
	for _, volume := range service.Volumes {
		entry := mount.Mount{Source: volume.Source, Target: volume.Target, ReadOnly: volume.ReadOnly}
		if volume.Type == types.VolumeTypeBind {
			entry.Type = mount.TypeBind
		} else {
			entry.Type = mount.TypeVolume
			if name, ok := volumes[volume.Source]; ok {
				entry.Source = name
			}
		}
		out = append(out, entry)
	}
	return out
}

func healthcheck(service types.ServiceConfig) *container.HealthConfig {
	check := service.HealthCheck
	if check == nil || len(check.Test) == 0 {
		return nil
	}
	config := &container.HealthConfig{Test: check.Test}
	if check.Interval != nil {
		config.Interval = time.Duration(*check.Interval)
	}
	if check.Timeout != nil {
		config.Timeout = time.Duration(*check.Timeout)
	}
	if check.StartPeriod != nil {
		config.StartPeriod = time.Duration(*check.StartPeriod)
	}
	if check.Retries != nil {
		config.Retries = int(*check.Retries)
	}
	return config
}

func aliases(name string, service types.ServiceConfig) []string {
	out := []string{name}
	for _, entry := range service.Networks {
		if entry != nil {
			out = append(out, entry.Aliases...)
		}
	}
	return out
}

func BuildSpec(svc catalog.Service, replica int, volumes map[string]string, overrides map[string]string) (Spec, error) {
	service := svc.Config
	env, files, err := readEnv(service, overrides)
	if err != nil {
		return Spec{}, err
	}
	exposed, bindings, err := ports(service)
	if err != nil {
		return Spec{}, err
	}
	labels := map[string]string{
		LabelManaged:   "true",
		LabelComponent: svc.Component,
	}
	for key, value := range service.Labels {
		labels[key] = value
	}
	config := &container.Config{
		Image:        service.Image,
		Cmd:          service.Command,
		Entrypoint:   service.Entrypoint,
		Env:          env,
		User:         service.User,
		Labels:       labels,
		ExposedPorts: exposed,
		Healthcheck:  healthcheck(service),
	}
	if service.StopGracePeriod != nil {
		seconds := int(time.Duration(*service.StopGracePeriod) / time.Second)
		config.StopTimeout = &seconds
	}
	restart := container.RestartPolicyUnlessStopped
	if svc.OneShot {
		restart = container.RestartPolicyDisabled
	}
	host := &container.HostConfig{
		PortBindings:  bindings,
		Mounts:        mounts(service, volumes),
		RestartPolicy: container.RestartPolicy{Name: restart},
		NetworkMode:   container.NetworkMode(catalog.Network),
	}
	net := &network.NetworkingConfig{EndpointsConfig: map[string]*network.EndpointSettings{
		catalog.Network: {Aliases: aliases(svc.Name, service)},
	}}
	return Spec{
		Name:      ContainerName(svc.Name, replica),
		Service:   svc.Name,
		Component: svc.Component,
		OneShot:   svc.OneShot,
		Config:    config,
		Host:      host,
		Network:   net,
		EnvFiles:  files,
	}, nil
}

func Hash(spec Spec, imageID string) (string, error) {
	config := *spec.Config
	labels := map[string]string{}
	for key, value := range config.Labels {
		if key != LabelSpec {
			labels[key] = value
		}
	}
	config.Labels = labels
	files := map[string]string{}
	for _, path := range spec.EnvFiles {
		sum, err := envfile.Hash(path)
		if err != nil {
			return "", err
		}
		files[path] = sum
	}
	canonical, err := json.Marshal(struct {
		Config   container.Config
		Host     *container.HostConfig
		Network  *network.NetworkingConfig
		Image    string
		EnvFiles map[string]string
	}{config, spec.Host, spec.Network, imageID, files})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}
