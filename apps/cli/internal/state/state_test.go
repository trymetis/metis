package state

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCreateUpdateLoad(t *testing.T) {
	dir := t.TempDir()
	st := New()
	st.App.Version = "1.4.0"
	if err := Create(dir, st); err != nil {
		t.Fatal(err)
	}
	if err := Create(dir, New()); err == nil {
		t.Fatal("Create overwrote an existing metis.json")
	}
	info, err := os.Stat(Path(dir))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("metis.json mode %v %v", info, err)
	}
	updated, err := Update(dir, func(st *State) error {
		st.Components.Worker = &Worker{Replicas: 2}
		return nil
	})
	if err != nil || updated.Components.Worker.Replicas != 2 {
		t.Fatalf("update %+v %v", updated, err)
	}
	loaded, err := Load(dir)
	if err != nil || loaded.App.Version != "1.4.0" || loaded.Components.Worker == nil || string(loaded.Updater.Last) != "null" {
		t.Fatalf("load %+v %v", loaded, err)
	}
	if _, err := os.Stat(Path(dir) + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("the temporary file was left behind")
	}
}

func TestNewerSchemaIsRefused(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(Path(dir), []byte(`{"schemaVersion":2,"writtenBy":"0.4.0"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := Load(dir)
	if err == nil || err.Error() != "metis.json was written by Metis CLI 0.4.0; run sudo metis self-update" {
		t.Fatalf("load: %v", err)
	}
}

func TestRunningUpgradeHoldsTheLock(t *testing.T) {
	dir := t.TempDir()
	st := New()
	started := time.Date(2026, 11, 11, 14, 2, 0, 0, time.Local)
	st.Updater.Last, _ = json.Marshal(map[string]string{"state": "UPGRADE_STATE_RUNNING", "startedAt": started.UTC().Format(time.RFC3339Nano)})
	if err := Create(dir, st); err != nil {
		t.Fatal(err)
	}
	held, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Release()
	_, err = Update(dir, func(*State) error { return nil })
	if err == nil || !strings.HasPrefix(err.Error(), "An upgrade is running (started 14:02).") {
		t.Fatalf("update during an upgrade: %v", err)
	}
	if _, err := held.Update(func(st *State) error { st.AppPort = 3001; return nil }); err != nil {
		t.Fatal(err)
	}
}

func TestRunningExportAndMoveHoldTheLock(t *testing.T) {
	for kind, want := range map[string]string{OperationExport: "An export is running (started 14:02)", OperationMove: "A database move is running (started 14:02)"} {
		dir := t.TempDir()
		st := New()
		started := time.Date(2026, 11, 11, 14, 2, 0, 0, time.Local)
		st.Running = &Operation{Kind: kind, StartedAt: started.UTC().Format(time.RFC3339Nano)}
		st.ExportRecipients = []string{"-----BEGIN PUBLIC KEY-----"}
		if err := Create(dir, st); err != nil {
			t.Fatal(err)
		}
		held, err := Acquire(dir)
		if err != nil {
			t.Fatal(err)
		}
		_, err = Update(dir, func(*State) error { return nil })
		if err == nil || !strings.HasPrefix(err.Error(), want) {
			t.Fatalf("update during %s: %v", kind, err)
		}
		held.Release()
		loaded, err := Load(dir)
		if err != nil || len(loaded.ExportRecipients) != 1 || loaded.Running == nil || loaded.Running.Kind != kind {
			t.Fatalf("loaded %+v %v", loaded, err)
		}
	}
}
