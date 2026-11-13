package archive

import (
	"archive/tar"
	"compress/gzip"
	"crypto/ecdh"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/keys"
)

type Identity struct {
	Key        *ecdh.PrivateKey
	Passphrase string
}

func readMetadata(reader *tar.Reader, path string) (*Metadata, error) {
	first, err := reader.Next()
	if err != nil || first.Name != MetadataName {
		return nil, fmt.Errorf("%s is not a Metis export: it does not start with %s", path, MetadataName)
	}
	if first.Size > maxMetadata {
		return nil, fmt.Errorf("%s: %s is too large", path, MetadataName)
	}
	raw, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	var meta Metadata
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, fmt.Errorf("%s: reading %s: %w", path, MetadataName, err)
	}
	if meta.Format != Format {
		return nil, fmt.Errorf("%s is a %q archive; this CLI reads %s, so a newer CLI may be needed (run metis self-update)", path, meta.Format, Format)
	}
	if err := json.Unmarshal(meta.RawHeader, &meta.Header); err != nil {
		return nil, fmt.Errorf("%s: reading the header: %w", path, err)
	}
	return &meta, nil
}

func ReadMetadata(path string) (*Metadata, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return readMetadata(tar.NewReader(file), path)
}

func Inspect(path string) (*Metadata, []string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()
	reader := tar.NewReader(file)
	meta, err := readMetadata(reader, path)
	if err != nil {
		return nil, nil, err
	}
	var problems []string
	seen := map[string]bool{}
	for {
		entry, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			problems = append(problems, fmt.Sprintf("the archive is damaged after %d entries: %v", len(seen), err))
			break
		}
		expected, ok := meta.File(entry.Name)
		if !ok {
			problems = append(problems, fmt.Sprintf("%s is not listed in %s", entry.Name, MetadataName))
			continue
		}
		seen[entry.Name] = true
		sum := sha256.New()
		size, err := io.Copy(sum, reader)
		switch {
		case err != nil:
			problems = append(problems, fmt.Sprintf("%s could not be read: %v", entry.Name, err))
		case size != expected.Size:
			problems = append(problems, fmt.Sprintf("%s is %d bytes, %s says %d", entry.Name, size, MetadataName, expected.Size))
		case hex.EncodeToString(sum.Sum(nil)) != expected.SHA256:
			problems = append(problems, fmt.Sprintf("%s does not match its SHA-256 in %s", entry.Name, MetadataName))
		}
	}
	for _, name := range meta.Header.Files {
		if !seen[name] {
			problems = append(problems, fmt.Sprintf("%s is missing", name))
		}
	}
	return meta, problems, nil
}

func (meta *Metadata) unlock(id Identity) ([]byte, error) {
	_, withoutRecipients, err := headerHashes(meta.RawHeader)
	if err != nil {
		return nil, err
	}
	if id.Key != nil {
		fingerprint := keys.Fingerprint(id.Key.PublicKey())
		for _, recipient := range meta.Header.Recipients {
			if recipient.Fingerprint == fingerprint {
				return unwrap(id.Key, recipient, withoutRecipients)
			}
		}
		return nil, fmt.Errorf("the key %s is not a recipient of this export; its recipients are %s", fingerprint, strings.Join(meta.Fingerprints(), ", "))
	}
	found := false
	for _, recipient := range meta.Header.Recipients {
		if recipient.KDF == nil {
			continue
		}
		found = true
		private, err := keys.Derive(id.Passphrase, *recipient.KDF)
		if err != nil {
			return nil, err
		}
		if keys.Fingerprint(private.PublicKey()) == recipient.Fingerprint {
			return unwrap(private, recipient, withoutRecipients)
		}
	}
	if !found {
		return nil, errors.New("this export has no passphrase recipient; pass --identity with a private key file")
	}
	return nil, errors.New("the passphrase does not open this export")
}

func unwrap(private *ecdh.PrivateKey, recipient Recipient, aad []byte) ([]byte, error) {
	ephemeral, err := ecdh.P256().NewPublicKey(recipient.Ephemeral)
	if err != nil {
		return nil, fmt.Errorf("recipient %s has a damaged ephemeral key: %w", recipient.Fingerprint, err)
	}
	shared, err := private.ECDH(ephemeral)
	if err != nil {
		return nil, err
	}
	aead, err := wrapAEAD(shared, recipient.Ephemeral, private.PublicKey().Bytes())
	if err != nil {
		return nil, err
	}
	exportKey, err := aead.Open(nil, make([]byte, aead.NonceSize()), recipient.WrappedKey, aad)
	if err != nil {
		return nil, errors.New("the export key could not be unwrapped: the header was changed or the archive is damaged")
	}
	return exportKey, nil
}

func (meta *Metadata) Fingerprints() []string {
	var out []string
	for _, recipient := range meta.Header.Recipients {
		out = append(out, recipient.Fingerprint)
	}
	return out
}

func Extract(path string, id Identity, outDir string, wanted ...string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := tar.NewReader(file)
	meta, err := readMetadata(reader, path)
	if err != nil {
		return nil, err
	}
	if len(wanted) == 0 {
		wanted = meta.Header.Files
	}
	for _, name := range wanted {
		target := filepath.Join(outDir, PlainName(name))
		if _, err := os.Stat(target); err == nil {
			return nil, fmt.Errorf("%s already exists", target)
		}
	}
	exportKey, err := meta.unlock(id)
	if err != nil {
		return nil, err
	}
	full, _, err := headerHashes(meta.RawHeader)
	if err != nil {
		return nil, err
	}
	written := map[string]string{}
	cleanup := func() {
		for _, done := range written {
			_ = os.Remove(done)
		}
	}
	for {
		entry, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			cleanup()
			return nil, fmt.Errorf("reading %s: %w", path, err)
		}
		if !slices.Contains(wanted, entry.Name) {
			continue
		}
		if !slices.Contains(meta.Header.Files, entry.Name) {
			cleanup()
			return nil, fmt.Errorf("%s is not listed in the header", entry.Name)
		}
		target := filepath.Join(outDir, PlainName(entry.Name))
		if err := decryptEntry(reader, exportKey, full, meta, entry.Name, target); err != nil {
			cleanup()
			return nil, err
		}
		written[entry.Name] = target
	}
	for _, name := range wanted {
		if _, ok := written[name]; !ok {
			cleanup()
			return nil, fmt.Errorf("%s has no %s", path, name)
		}
	}
	return written, nil
}

func decryptEntry(in io.Reader, exportKey, aad []byte, meta *Metadata, name, target string) (err error) {
	expected, ok := meta.File(name)
	if !ok {
		return fmt.Errorf("%s is not listed in %s", name, MetadataName)
	}
	aead, err := fileAEAD(exportKey, name)
	if err != nil {
		return err
	}
	partial := target + ".partial"
	out, err := os.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = out.Close()
			_ = os.Remove(partial)
		}
	}()
	sum := sha256.New()
	counter := &countingWriter{}
	zip, err := gzip.NewReader(newOpener(aead, aad, io.TeeReader(in, io.MultiWriter(sum, counter)), name))
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	if _, err = io.Copy(out, zip); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	if err = zip.Close(); err != nil {
		return err
	}
	if err = checkSum(sum, counter.n, expected); err != nil {
		return err
	}
	if err = out.Close(); err != nil {
		return err
	}
	return os.Rename(partial, target)
}

func checkSum(sum hash.Hash, size int64, expected File) error {
	if size != expected.Size || hex.EncodeToString(sum.Sum(nil)) != expected.SHA256 {
		return fmt.Errorf("%s does not match the size and SHA-256 in %s", expected.Name, MetadataName)
	}
	return nil
}
