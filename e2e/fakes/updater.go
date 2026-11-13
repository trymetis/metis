package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"maps"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect/v2"
	"connectrpc.com/connect/v2/connecthttp"
	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/gen/metis/updater/v1/updaterv1connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	defaultUpdaterSocket = "/run/metis-updater/updater.sock"
	updaterReadyError    = "http://app:3000/api/readyz was not ready within 2m0s (last: answered 503)"
	updaterSnapshotDir   = "/opt/metis-suite/.updater-snapshot"
	defaultReleaseDir    = "/release"
	nextReleaseNotes     = "### Added\n\n- Saved searches can be pinned to the sidebar.\n\n### Fixed\n\n- Calendar invites from Outlook show the organizer's time zone."
)

var (
	releasePattern  = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)
	releaseFile     = regexp.MustCompile(`^app-v([0-9]+\.[0-9]+\.[0-9]+)\.md$`)
	releaseDefaults updaterSettings
)

type updaterSettings struct {
	Current   string            `json:"current"`
	Releases  []string          `json:"releases"`
	Notes     map[string]string `json:"notes"`
	Rollback  string            `json:"rollback"`
	Snapshots bool              `json:"snapshots"`
	Outcome   string            `json:"outcome"`
	StepMs    int               `json:"stepMs"`
	MinCli    map[string]string `json:"minCli"`
}

func loadReleaseDefaults(dir string) (updaterSettings, error) {
	pkg, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return updaterSettings{}, err
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(pkg, &manifest); err != nil {
		return updaterSettings{}, fmt.Errorf("package.json: %w", err)
	}
	current := manifest.Version
	if !releasePattern.MatchString(current) {
		return updaterSettings{}, fmt.Errorf("package.json version %q is not a release version", current)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "releases"))
	if err != nil {
		return updaterSettings{}, err
	}
	history := []string{current}
	for _, entry := range entries {
		match := releaseFile.FindStringSubmatch(entry.Name())
		if match == nil {
			continue
		}
		if version := match[1]; !slices.Contains(history, version) && olderRelease(version, current) {
			history = append(history, version)
		}
	}
	slices.SortFunc(history, func(a, b string) int {
		if olderRelease(a, b) {
			return 1
		}
		return -1
	})
	parts := strings.Split(current, ".")
	minor, _ := strconv.Atoi(parts[1])
	next := fmt.Sprintf("%s.%d.0", parts[0], minor+1)
	rollback := ""
	if len(history) > 1 {
		rollback = history[1]
	}
	return updaterSettings{
		Current:   current,
		Releases:  append([]string{next}, history...),
		Notes:     map[string]string{next: nextReleaseNotes},
		Rollback:  rollback,
		Snapshots: true,
		Outcome:   "succeed",
		StepMs:    1_000,
		MinCli:    map[string]string{},
	}, nil
}

func defaultUpdaterSettings() updaterSettings {
	settings := releaseDefaults
	settings.Releases = slices.Clone(releaseDefaults.Releases)
	settings.Notes = maps.Clone(releaseDefaults.Notes)
	settings.MinCli = maps.Clone(releaseDefaults.MinCli)
	return settings
}

type upgradePlan struct {
	steps    []updaterv1.UpgradeStep
	state    updaterv1.UpgradeState
	restored bool
	err      string
}

var upgradeOutcomes = []string{"succeed", "preflight-fails", "never-ready", "restore-fails"}

func upgradeSteps(snapshots bool, through updaterv1.UpgradeStep) []updaterv1.UpgradeStep {
	steps := []updaterv1.UpgradeStep{updaterv1.UpgradeStep_UPGRADE_STEP_PULL}
	if snapshots {
		steps = append(steps, updaterv1.UpgradeStep_UPGRADE_STEP_SNAPSHOT)
	}
	for _, step := range []updaterv1.UpgradeStep{
		updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT,
		updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH,
		updaterv1.UpgradeStep_UPGRADE_STEP_READY,
	} {
		steps = append(steps, step)
		if step == through {
			break
		}
	}
	return steps
}

func planFor(kind updaterv1.UpgradeKind, outcome, from string, snapshots bool) upgradePlan {
	if kind == updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK {
		return upgradePlan{
			steps: []updaterv1.UpgradeStep{
				updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
				updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE,
				updaterv1.UpgradeStep_UPGRADE_STEP_SWITCH,
				updaterv1.UpgradeStep_UPGRADE_STEP_READY,
			},
			state: updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED,
		}
	}
	if from == "" {
		from = "unpinned"
	}
	restore := updaterv1.UpgradeStep_UPGRADE_STEP_RESTORE
	switch outcome {
	case "preflight-fails":
		cause := "preflight failed: exit status 1"
		if snapshots {
			return upgradePlan{
				steps:    append(upgradeSteps(true, updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT), restore),
				state:    updaterv1.UpgradeState_UPGRADE_STATE_FAILED,
				restored: true,
				err:      cause,
			}
		}
		return upgradePlan{
			steps: upgradeSteps(false, updaterv1.UpgradeStep_UPGRADE_STEP_PREFLIGHT),
			state: updaterv1.UpgradeState_UPGRADE_STATE_FAILED,
			err:   cause,
		}
	case "never-ready":
		return upgradePlan{
			steps:    append(upgradeSteps(snapshots, updaterv1.UpgradeStep_UPGRADE_STEP_READY), restore),
			state:    updaterv1.UpgradeState_UPGRADE_STATE_FAILED,
			restored: true,
			err:      updaterReadyError,
		}
	case "restore-fails":
		again := updaterReadyError
		if snapshots {
			again = fmt.Sprintf("%s (the database snapshot is in %s/pending)", again, updaterSnapshotDir)
		}
		return upgradePlan{
			steps: append(upgradeSteps(snapshots, updaterv1.UpgradeStep_UPGRADE_STEP_READY), restore),
			state: updaterv1.UpgradeState_UPGRADE_STATE_ROLLBACK_FAILED,
			err:   fmt.Sprintf("%s; restoring %s also failed: %s", updaterReadyError, from, again),
		}
	default:
		return upgradePlan{
			steps: upgradeSteps(snapshots, updaterv1.UpgradeStep_UPGRADE_STEP_READY),
			state: updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED,
		}
	}
}

type updaterFake struct {
	socket string

	mu         sync.Mutex
	settings   updaterSettings
	snapshotAt time.Time
	last       *updaterv1.Upgrade
	generation int
	server     *http.Server
}

func (f *updaterFake) abortedIfRunning() error {
	if f.last != nil && f.last.GetState() == updaterv1.UpgradeState_UPGRADE_STATE_RUNNING {
		return connect.NewError(connect.CodeAborted, "an upgrade or rollback is already running")
	}
	return nil
}

func upgradeID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func olderRelease(a, b string) bool {
	left, right := strings.Split(a, "."), strings.Split(b, ".")
	for i := range left {
		l, _ := strconv.Atoi(left[i])
		r, _ := strconv.Atoi(right[i])
		if l != r {
			return l < r
		}
	}
	return false
}

func (f *updaterFake) undoTarget() string {
	if !f.settings.Snapshots {
		return ""
	}
	return f.settings.Rollback
}

func (f *updaterFake) start(kind updaterv1.UpgradeKind, to, requestedBy string) *updaterv1.Upgrade {
	from := f.settings.Current
	snapshots := f.settings.Snapshots
	plan := planFor(kind, f.settings.Outcome, from, snapshots)
	f.settings.Outcome = "succeed"
	upgrade := &updaterv1.Upgrade{
		Id:          upgradeID(),
		Kind:        kind,
		FromVersion: from,
		ToVersion:   to,
		State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
		Step:        plan.steps[0],
		StartedAt:   timestamppb.Now(),
		RequestedBy: requestedBy,
	}
	f.last = upgrade
	run := f.generation
	stepEvery := time.Duration(f.settings.StepMs) * time.Millisecond

	var advance func(index int)
	advance = func(index int) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if run != f.generation {
			return
		}
		if index < len(plan.steps) {
			upgrade.Step = plan.steps[index]
			time.AfterFunc(stepEvery, func() { advance(index + 1) })
			return
		}
		upgrade.State = plan.state
		upgrade.Restored = plan.restored
		upgrade.Error = plan.err
		upgrade.FinishedAt = timestamppb.Now()
		if plan.state != updaterv1.UpgradeState_UPGRADE_STATE_SUCCEEDED {
			return
		}
		f.settings.Current = to
		f.settings.Rollback = ""
		if kind == updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE && snapshots {
			f.settings.Rollback = from
			f.snapshotAt = time.Now()
		}
	}
	upgrade.Step = plan.steps[0]
	time.AfterFunc(stepEvery, func() { advance(1) })
	return upgrade
}

func (f *updaterFake) GetStatus(context.Context, *updaterv1.GetStatusRequest) (*updaterv1.GetStatusResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	releases := make([]*updaterv1.Release, 0, len(f.settings.Releases))
	for _, version := range f.settings.Releases {
		releases = append(releases, &updaterv1.Release{Version: version, Notes: f.settings.Notes[version]})
	}
	status := &updaterv1.GetStatusResponse{
		CurrentVersion: f.settings.Current,
		Releases:       releases,
		Snapshots:      f.settings.Snapshots,
	}
	if target := f.undoTarget(); target != "" {
		status.RollbackVersion = target
		status.RollbackSnapshotAt = timestamppb.New(f.snapshotAt)
	}
	return status, nil
}

func (f *updaterFake) StartUpgrade(_ context.Context, req *updaterv1.StartUpgradeRequest) (*updaterv1.StartUpgradeResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	version := req.GetVersion()
	if !releasePattern.MatchString(version) {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Sprintf("%q is not a release version such as 1.4.0", version))
	}
	if !slices.Contains(f.settings.Releases, version) {
		return nil, connect.NewError(connect.CodeNotFound, version+" is not a published release")
	}
	if minCli := f.settings.MinCli[version]; minCli != "" {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Sprintf("This release needs Metis CLI %s or later. Run sudo metis self-update on the server, then try again.", minCli))
	}
	if err := f.abortedIfRunning(); err != nil {
		return nil, err
	}
	current := f.settings.Current
	if current != "" && current != version && olderRelease(version, current) {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Sprintf("%s is older than the running %s; only newer releases can be installed", version, current))
	}
	if version == current {
		return nil, connect.NewError(connect.CodeAlreadyExists, version+" is already running")
	}
	return &updaterv1.StartUpgradeResponse{
		Upgrade: f.start(updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE, version, req.GetRequestedBy()),
	}, nil
}

func (f *updaterFake) GetUpgrade(context.Context, *updaterv1.GetUpgradeRequest) (*updaterv1.GetUpgradeResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return &updaterv1.GetUpgradeResponse{Upgrade: f.last}, nil
}

func (f *updaterFake) Rollback(_ context.Context, req *updaterv1.RollbackRequest) (*updaterv1.RollbackResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.abortedIfRunning(); err != nil {
		return nil, err
	}
	target := f.undoTarget()
	if target == "" {
		return nil, connect.NewError(connect.CodeFailedPrecondition, "there is no upgrade to undo")
	}
	if target == f.settings.Current {
		return nil, connect.NewError(connect.CodeAlreadyExists, target+" is already running")
	}
	return &updaterv1.RollbackResponse{
		Upgrade: f.start(updaterv1.UpgradeKind_UPGRADE_KIND_ROLLBACK, target, req.GetRequestedBy()),
	}, nil
}

func (f *updaterFake) up() error {
	if f.server != nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(f.socket), 0o755); err != nil {
		return err
	}
	if err := os.Remove(f.socket); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	listener, err := net.Listen("unix", f.socket)
	if err != nil {
		return err
	}
	if err := os.Chmod(f.socket, 0o600); err != nil {
		_ = listener.Close()
		return err
	}
	rpc := connect.NewServer()
	updaterv1connect.RegisterUpdaterServiceHandler(rpc, f)
	mux := http.NewServeMux()
	connecthttp.Mount(mux, rpc)
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)
	srv := &http.Server{Handler: mux, Protocols: protocols, ReadHeaderTimeout: 10 * time.Second}
	f.server = srv
	go func() {
		if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[updater] socket: %v", err)
		}
	}()
	return nil
}

func (f *updaterFake) down() error {
	if f.server == nil {
		return nil
	}
	err := f.server.Close()
	f.server = nil
	if rmErr := os.Remove(f.socket); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
		return rmErr
	}
	return err
}

func (f *updaterFake) state(w http.ResponseWriter) {
	upgrade := json.RawMessage("null")
	if f.last != nil {
		encoded, err := protojson.Marshal(f.last)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		upgrade = encoded
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"up":       f.server != nil,
		"settings": f.settings,
		"upgrade":  upgrade,
	})
}

func parseUpdaterSettings(r *http.Request) (updaterSettings, error) {
	settings := defaultUpdaterSettings()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return settings, err
	}
	raw := map[string]json.RawMessage{}
	if len(bytes.TrimSpace(body)) > 0 {
		if err := json.Unmarshal(body, &raw); err != nil {
			return settings, err
		}
	}
	decode := func(key string, into any) error {
		value, ok := raw[key]
		if !ok {
			return nil
		}
		return json.Unmarshal(value, into)
	}
	for key, into := range map[string]any{
		"current":   &settings.Current,
		"releases":  &settings.Releases,
		"notes":     &settings.Notes,
		"rollback":  &settings.Rollback,
		"snapshots": &settings.Snapshots,
		"outcome":   &settings.Outcome,
		"stepMs":    &settings.StepMs,
		"minCli":    &settings.MinCli,
	} {
		if err := decode(key, into); err != nil {
			return settings, fmt.Errorf("%s: %w", key, err)
		}
	}
	if !slices.Contains(upgradeOutcomes, settings.Outcome) {
		return settings, fmt.Errorf("outcome: %q is not one of succeed, preflight-fails, never-ready, restore-fails", settings.Outcome)
	}
	if settings.StepMs < 0 {
		return settings, errors.New("stepMs: must be at least 0")
	}
	return settings, nil
}

func runUpdater() error {
	socket := os.Getenv("E2E_UPDATER_SOCKET")
	if socket == "" {
		socket = defaultUpdaterSocket
	}
	releaseDir := os.Getenv("E2E_RELEASE_DIR")
	if releaseDir == "" {
		releaseDir = defaultReleaseDir
	}
	defaults, err := loadReleaseDefaults(releaseDir)
	if err != nil {
		return fmt.Errorf("release history: %w", err)
	}
	releaseDefaults = defaults
	fake := &updaterFake{socket: socket, settings: defaultUpdaterSettings(), snapshotAt: time.Now().Add(-time.Hour)}
	if err := fake.up(); err != nil {
		return err
	}

	control := http.NewServeMux()
	healthRoute(control)
	control.HandleFunc("GET /state", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.state(w)
	})
	control.HandleFunc("POST /reset", func(w http.ResponseWriter, r *http.Request) {
		settings, err := parseUpdaterSettings(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, []map[string]string{{"message": err.Error()}})
			return
		}
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.generation++
		fake.last = nil
		fake.settings = settings
		fake.snapshotAt = time.Now().Add(-time.Hour)
		if err := fake.up(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	control.HandleFunc("POST /hold", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		fake.generation++
		to := fake.settings.Current
		if len(fake.settings.Releases) > 0 {
			to = fake.settings.Releases[0]
		}
		fake.last = &updaterv1.Upgrade{
			Id:          "held",
			Kind:        updaterv1.UpgradeKind_UPGRADE_KIND_UPGRADE,
			FromVersion: fake.settings.Current,
			ToVersion:   to,
			State:       updaterv1.UpgradeState_UPGRADE_STATE_RUNNING,
			Step:        updaterv1.UpgradeStep_UPGRADE_STEP_PULL,
			StartedAt:   timestamppb.Now(),
		}
		fake.state(w)
	})
	control.HandleFunc("POST /down", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		if err := fake.down(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	control.HandleFunc("POST /up", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		if err := fake.up(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		fake.state(w)
	})
	fallback(control, "GET /health | GET /state | POST /reset, /hold, /down, /up")

	log.Printf("[updater] serving the updater protocol on %s, control on :8080", socket)
	return serve(":8080", control)
}
