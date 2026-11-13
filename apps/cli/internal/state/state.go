package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

const (
	SchemaVersion = 1
	FileName      = "metis.json"
	LockName      = "metis.lock"
	DefaultPort   = 3000
)

type Images struct {
	App       string `json:"app"`
	Preflight string `json:"preflight"`
	Worker    string `json:"worker"`
}

type App struct {
	Version string `json:"version"`
	Images  Images `json:"images"`
}

type Sqld struct{}

type Caddy struct {
	Domain string `json:"domain"`
}

type UpdaterMode string

const (
	UpdaterSystemd UpdaterMode = "systemd"
	UpdaterDocker  UpdaterMode = "docker"
)

type UpdaterComponent struct {
	Mode UpdaterMode `json:"mode"`
}

type Worker struct {
	Replicas int `json:"replicas"`
}

type Redis struct{}

type Objstore struct {
	DataDir string `json:"dataDir"`
	Direct  bool   `json:"direct"`
}

type GatewayResend struct {
	Domain         string `json:"domain"`
	Host           string `json:"host"`
	Database       string `json:"database"`
	Blobs          string `json:"blobs"`
	Version        string `json:"version"`
	ResendDomainID string `json:"resendDomainId,omitempty"`
	WebhookID      string `json:"webhookId,omitempty"`
}

type GatewayCloudflare struct {
	AccountID string   `json:"accountId"`
	ZoneID    string   `json:"zoneId"`
	D1ID      string   `json:"d1Id"`
	Endpoint  string   `json:"endpoint"`
	Addresses []string `json:"addresses,omitempty"`
	Version   string   `json:"version"`
}

type GatewaySES struct {
	Region   string `json:"region"`
	Account  string `json:"account"`
	Endpoint string `json:"endpoint"`
	RuleSet  string `json:"ruleSet"`
	Version  string `json:"version"`
}

type Components struct {
	Sqld              *Sqld                        `json:"sqld,omitempty"`
	Caddy             *Caddy                       `json:"caddy,omitempty"`
	Updater           *UpdaterComponent            `json:"updater,omitempty"`
	Worker            *Worker                      `json:"worker,omitempty"`
	Redis             *Redis                       `json:"redis,omitempty"`
	Objstore          *Objstore                    `json:"objstore,omitempty"`
	GatewayResend     *GatewayResend               `json:"gateway-resend,omitempty"`
	GatewayCloudflare map[string]GatewayCloudflare `json:"gateway-cloudflare,omitempty"`
	GatewaySES        map[string]GatewaySES        `json:"gateway-ses,omitempty"`
}

type UpdaterRecord struct {
	Previous   *Images         `json:"previous"`
	SnapshotAt string          `json:"snapshotAt"`
	Last       json.RawMessage `json:"last"`
}

type State struct {
	SchemaVersion int           `json:"schemaVersion"`
	WrittenBy     string        `json:"writtenBy"`
	AppPort       int           `json:"appPort"`
	App           App           `json:"app"`
	Components    Components    `json:"components"`
	Updater       UpdaterRecord `json:"updater"`
}

var ErrNotFound = errors.New("metis.json does not exist")

func New() *State {
	return &State{
		SchemaVersion: SchemaVersion,
		AppPort:       DefaultPort,
		Updater:       UpdaterRecord{Last: json.RawMessage("null")},
	}
}

func Path(dir string) string {
	return filepath.Join(dir, FileName)
}

func Load(dir string) (*State, error) {
	raw, err := os.ReadFile(Path(dir))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return decode(raw)
}

func decode(raw []byte) (*State, error) {
	var head struct {
		SchemaVersion int    `json:"schemaVersion"`
		WrittenBy     string `json:"writtenBy"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return nil, fmt.Errorf("metis.json: %w", err)
	}
	if head.SchemaVersion > SchemaVersion {
		return nil, fmt.Errorf("metis.json was written by Metis CLI %s; run sudo metis self-update", head.WrittenBy)
	}
	st := New()
	if err := json.Unmarshal(raw, st); err != nil {
		return nil, fmt.Errorf("metis.json: %w", err)
	}
	if len(st.Updater.Last) == 0 {
		st.Updater.Last = json.RawMessage("null")
	}
	if st.AppPort == 0 {
		st.AppPort = DefaultPort
	}
	return st, nil
}

func write(dir string, st *State) error {
	st.SchemaVersion = SchemaVersion
	st.WrittenBy = version.Version
	raw, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := Path(dir) + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, Path(dir))
}

func Create(dir string, st *State) error {
	lock, err := Acquire(dir)
	if err != nil {
		return err
	}
	defer lock.Release()
	if _, err := os.Stat(Path(dir)); err == nil {
		return fmt.Errorf("%s already exists", Path(dir))
	}
	return write(dir, st)
}

func Update(dir string, change func(*State) error) (*State, error) {
	lock, err := Acquire(dir)
	if err != nil {
		return nil, err
	}
	defer lock.Release()
	return lock.Update(change)
}

func (lock *Lock) Update(change func(*State) error) (*State, error) {
	st, err := Load(lock.dir)
	if err != nil {
		return nil, err
	}
	if err := change(st); err != nil {
		return nil, err
	}
	if err := write(lock.dir, st); err != nil {
		return nil, err
	}
	return st, nil
}

func (st *State) RunningUpgradeStart() (time.Time, bool) {
	var last struct {
		State     string `json:"state"`
		StartedAt string `json:"startedAt"`
	}
	if len(st.Updater.Last) == 0 || json.Unmarshal(st.Updater.Last, &last) != nil {
		return time.Time{}, false
	}
	if last.State != "UPGRADE_STATE_RUNNING" {
		return time.Time{}, false
	}
	started, err := time.Parse(time.RFC3339Nano, last.StartedAt)
	return started, err == nil
}
