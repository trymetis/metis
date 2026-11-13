package archive

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/keys"
)

const (
	Format        = "metis-export/v1"
	MetadataName  = "metadata.json"
	App           = "app.sqlite.gz.enc"
	Mastra        = "mastra.sqlite.gz.enc"
	BootEnv       = "boot.env.gz.enc"
	GatewayResend = "gateway-resend.sqlite.gz.enc"
	entrySuffix   = ".gz.enc"
	maxMetadata   = 1 << 20
	wrapInfo      = "metis-export/v1/wrap"
	fileInfo      = "metis-export/v1/file/"
)

type Recipient struct {
	Fingerprint string    `json:"fingerprint"`
	Ephemeral   []byte    `json:"ephemeral"`
	WrappedKey  []byte    `json:"wrappedKey"`
	KDF         *keys.KDF `json:"kdf"`
}

type Header struct {
	CreatedAt        string      `json:"createdAt"`
	AppVersion       string      `json:"appVersion"`
	Migration        string      `json:"migration"`
	Source           string      `json:"source"`
	MaintenanceSince *string     `json:"maintenanceSince"`
	Files            []string    `json:"files"`
	Recipients       []Recipient `json:"recipients"`
}

type File struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type Metadata struct {
	Format    string          `json:"format"`
	RawHeader json.RawMessage `json:"header"`
	Files     []File          `json:"files"`
	Header    Header          `json:"-"`
}

func PlainName(entry string) string {
	return strings.TrimSuffix(entry, entrySuffix)
}

func (meta *Metadata) File(name string) (File, bool) {
	for _, file := range meta.Files {
		if file.Name == name {
			return file, true
		}
	}
	return File{}, false
}

func canonicalHash(raw []byte, drop string) ([]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var tree map[string]any
	if err := decoder.Decode(&tree); err != nil {
		return nil, err
	}
	if drop != "" {
		delete(tree, drop)
	}
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(tree); err != nil {
		return nil, err
	}
	sum := sha256.Sum256(bytes.TrimSuffix(out.Bytes(), []byte("\n")))
	return sum[:], nil
}

func headerHashes(raw []byte) (full, withoutRecipients []byte, err error) {
	if full, err = canonicalHash(raw, ""); err != nil {
		return nil, nil, err
	}
	if withoutRecipients, err = canonicalHash(raw, "recipients"); err != nil {
		return nil, nil, err
	}
	return full, withoutRecipients, nil
}
