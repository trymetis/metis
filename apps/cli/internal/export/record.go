package export

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/keys"
)

const (
	LocationInstance = "instance"
	LocationLocal    = "local"
	LocationS3       = "s3"
	recordTable      = "export_record"
	cloudMailKey     = "CONSOLE_MAIL_URL"
)

var RecordColumns = []string{
	"id", "created_at", "app_version", "migration", "maintenance_since", "file_name",
	"size", "sha256", "recipients", "locations", "instance_url",
}

type Location struct {
	Kind     string  `json:"kind"`
	Location string  `json:"location"`
	Host     *string `json:"host"`
	Endpoint *string `json:"endpoint"`
}

type recipientEntry struct {
	Fingerprint string `json:"fingerprint"`
	Passphrase  bool   `json:"passphrase"`
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	sum := sha256.New()
	if _, err := io.Copy(sum, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(sum.Sum(nil)), nil
}

func hostname() *string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return nil
	}
	return &name
}

func newID() string {
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

func localLocation(kind, path string) Location {
	if absolute, err := filepath.Abs(path); err == nil {
		path = absolute
	}
	return Location{Kind: kind, Location: path, Host: hostname()}
}

type recordInput struct {
	createdAt        time.Time
	appVersion       string
	migration        string
	maintenanceSince *time.Time
	fileName         string
	size             int64
	sha256           string
	recipients       []*keys.Public
	locations        []Location
	instanceURL      string
}

func record(ctx context.Context, app *hrana.Client, in recordInput) (bool, error) {
	exists, err := app.Query(ctx, "SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name = ?", recordTable)
	if err != nil {
		return false, err
	}
	if count, _ := hrana.Int(exists.Rows[0][0]); count == 0 {
		return false, nil
	}
	var recipients []recipientEntry
	for _, recipient := range in.recipients {
		recipients = append(recipients, recipientEntry{Fingerprint: keys.Fingerprint(recipient.Key), Passphrase: recipient.KDF != nil})
	}
	recipientsJSON, err := json.Marshal(recipients)
	if err != nil {
		return false, err
	}
	locationsJSON, err := json.Marshal(in.locations)
	if err != nil {
		return false, err
	}
	var since any
	if in.maintenanceSince != nil {
		since = in.maintenanceSince.UnixMilli()
	}
	_, err = app.Execute(ctx, hrana.Stmt{
		SQL: "INSERT INTO export_record (id, created_at, app_version, migration, maintenance_since, file_name, size, sha256, recipients, locations, instance_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		Args: []any{
			newID(), in.createdAt.UnixMilli(), in.appVersion, in.migration, since, in.fileName,
			in.size, in.sha256, string(recipientsJSON), string(locationsJSON), in.instanceURL,
		},
	})
	return err == nil, err
}
