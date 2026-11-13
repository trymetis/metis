package docker

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/moby/moby/client"
)

const (
	keyring       = "/etc/apt/keyrings/docker.asc"
	sourcesFile   = "/etc/apt/sources.list.d/docker.sources"
	installDocsAt = "https://docs.docker.com/engine/install/"
)

var ErrUnsupported = fmt.Errorf("Install Docker Engine first: %s", installDocsAt)

type osRelease struct {
	ID       string
	Codename string
}

func readOSRelease(path string) (osRelease, error) {
	file, err := os.Open(path)
	if err != nil {
		return osRelease{}, err
	}
	defer file.Close()
	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key, value, ok := strings.Cut(scanner.Text(), "=")
		if ok {
			values[key] = strings.Trim(value, `"'`)
		}
	}
	release := osRelease{ID: values["ID"], Codename: values["VERSION_CODENAME"]}
	if release.ID == "ubuntu" && values["UBUNTU_CODENAME"] != "" {
		release.Codename = values["UBUNTU_CODENAME"]
	}
	return release, scanner.Err()
}

func Reachable(ctx context.Context) bool {
	engine, err := client.New(client.FromEnv)
	if err != nil {
		return false
	}
	defer engine.Close()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err = engine.Ping(ctx, client.PingOptions{})
	return err == nil
}

func run(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s %s: %w\n%s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func download(ctx context.Context, url, path string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: HTTP %d", url, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	return os.WriteFile(path, body, 0o644)
}

func Install(ctx context.Context) error {
	release, err := readOSRelease("/etc/os-release")
	if errors.Is(err, os.ErrNotExist) || (release.ID != "debian" && release.ID != "ubuntu") {
		return ErrUnsupported
	}
	if err != nil {
		return err
	}
	if release.Codename == "" {
		return fmt.Errorf("/etc/os-release names no release codename. %w", ErrUnsupported)
	}
	log.Printf("[docker] installing Docker Engine from Docker's apt repository for %s %s", release.ID, release.Codename)
	if _, err := run(ctx, "apt-get", "update"); err != nil {
		return err
	}
	if _, err := run(ctx, "apt-get", "install", "-y", "ca-certificates"); err != nil {
		return err
	}
	if err := os.MkdirAll("/etc/apt/keyrings", 0o755); err != nil {
		return err
	}
	if err := download(ctx, "https://download.docker.com/linux/"+release.ID+"/gpg", keyring); err != nil {
		return err
	}
	arch, err := run(ctx, "dpkg", "--print-architecture")
	if err != nil {
		return err
	}
	sources := fmt.Sprintf("Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: %s\n",
		release.ID, release.Codename, strings.TrimSpace(arch), keyring)
	if err := os.WriteFile(sourcesFile, []byte(sources), 0o644); err != nil {
		return err
	}
	if _, err := run(ctx, "apt-get", "update"); err != nil {
		return err
	}
	if _, err := run(ctx, "apt-get", "install", "-y", "docker-ce", "docker-ce-cli", "containerd.io"); err != nil {
		return err
	}
	if _, err := run(ctx, "systemctl", "enable", "--now", "docker"); err != nil {
		return err
	}
	return nil
}

func Ensure(ctx context.Context) error {
	if Reachable(ctx) {
		return nil
	}
	if err := Install(ctx); err != nil {
		return err
	}
	if !Reachable(ctx) {
		return errors.New("Docker Engine was installed but does not answer on its socket")
	}
	return nil
}
