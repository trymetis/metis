package archive

import (
	"archive/tar"
	"compress/gzip"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/keys"
)

const TempPrefix = ".metis-export-tmp-"

type Source struct {
	Name string
	Path string
}

type Spec struct {
	Dir              string
	CreatedAt        time.Time
	AppVersion       string
	Migration        string
	Source           string
	MaintenanceSince *time.Time
	Recipients       []*keys.Public
	Files            []Source
}

func FileName(createdAt time.Time) string {
	return "metis-export-" + createdAt.UTC().Format("20060102T150405Z") + ".tar"
}

func TempDir(dir string) (string, error) {
	return os.MkdirTemp(dir, TempPrefix)
}

func CleanStale(dir string) error {
	matches, err := filepath.Glob(filepath.Join(dir, TempPrefix+"*"))
	if err != nil {
		return err
	}
	for _, match := range matches {
		if err := os.RemoveAll(match); err != nil {
			return err
		}
	}
	return nil
}

func wrapKey(exportKey []byte, recipient *ecdh.PublicKey, aad []byte) (ephemeral, wrapped []byte, err error) {
	private, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	shared, err := private.ECDH(recipient)
	if err != nil {
		return nil, nil, err
	}
	ephemeral = private.PublicKey().Bytes()
	aead, err := wrapAEAD(shared, ephemeral, recipient.Bytes())
	if err != nil {
		return nil, nil, err
	}
	return ephemeral, aead.Seal(nil, make([]byte, aead.NonceSize()), exportKey, aad), nil
}

func wrapAEAD(shared, ephemeral, recipient []byte) (cipher.AEAD, error) {
	salt := append(append([]byte{}, ephemeral...), recipient...)
	key, err := hkdf.Key(sha256.New, shared, salt, wrapInfo, 32)
	if err != nil {
		return nil, err
	}
	return newGCM(key)
}

func Write(spec Spec) (string, int64, error) {
	if len(spec.Recipients) == 0 {
		return "", 0, errors.New("an export needs at least one recipient")
	}
	exportKey := make([]byte, 32)
	if _, err := rand.Read(exportKey); err != nil {
		return "", 0, err
	}
	header := Header{
		CreatedAt:  spec.CreatedAt.UTC().Format(time.RFC3339),
		AppVersion: spec.AppVersion,
		Migration:  spec.Migration,
		Source:     spec.Source,
		Files:      []string{},
		Recipients: []Recipient{},
	}
	if spec.MaintenanceSince != nil {
		since := spec.MaintenanceSince.UTC().Format(time.RFC3339)
		header.MaintenanceSince = &since
	}
	for _, file := range spec.Files {
		header.Files = append(header.Files, file.Name)
	}
	raw, err := json.Marshal(header)
	if err != nil {
		return "", 0, err
	}
	_, withoutRecipients, err := headerHashes(raw)
	if err != nil {
		return "", 0, err
	}
	for _, recipient := range spec.Recipients {
		ephemeral, wrapped, err := wrapKey(exportKey, recipient.Key, withoutRecipients)
		if err != nil {
			return "", 0, err
		}
		header.Recipients = append(header.Recipients, Recipient{
			Fingerprint: keys.Fingerprint(recipient.Key),
			Ephemeral:   ephemeral,
			WrappedKey:  wrapped,
			KDF:         recipient.KDF,
		})
	}
	if raw, err = json.Marshal(header); err != nil {
		return "", 0, err
	}
	full, _, err := headerHashes(raw)
	if err != nil {
		return "", 0, err
	}

	tmp, err := TempDir(spec.Dir)
	if err != nil {
		return "", 0, err
	}
	defer os.RemoveAll(tmp)
	meta := Metadata{Format: Format, RawHeader: raw}
	for _, file := range spec.Files {
		entry, err := encryptFile(exportKey, full, file, filepath.Join(tmp, file.Name))
		if err != nil {
			return "", 0, err
		}
		meta.Files = append(meta.Files, entry)
	}
	metadata, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return "", 0, err
	}

	path := filepath.Join(spec.Dir, FileName(spec.CreatedAt))
	if _, err := os.Stat(path); err == nil {
		return "", 0, fmt.Errorf("%s already exists", path)
	}
	size, err := writeTar(path, spec.CreatedAt, metadata, tmp, meta.Files)
	if err != nil {
		return "", 0, err
	}
	return path, size, nil
}

func encryptFile(exportKey, aad []byte, source Source, out string) (File, error) {
	in, err := os.Open(source.Path)
	if err != nil {
		return File{}, err
	}
	defer in.Close()
	target, err := os.OpenFile(out, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return File{}, err
	}
	defer target.Close()
	aead, err := fileAEAD(exportKey, source.Name)
	if err != nil {
		return File{}, err
	}
	hash := sha256.New()
	counter := &countingWriter{}
	seal := newSealer(aead, aad, io.MultiWriter(target, hash, counter))
	zip := gzip.NewWriter(seal)
	if _, err := io.Copy(zip, in); err != nil {
		return File{}, fmt.Errorf("encrypting %s: %w", source.Name, err)
	}
	if err := zip.Close(); err != nil {
		return File{}, err
	}
	if err := seal.Close(); err != nil {
		return File{}, err
	}
	return File{Name: source.Name, Size: counter.n, SHA256: hex.EncodeToString(hash.Sum(nil))}, target.Close()
}

type countingWriter struct{ n int64 }

func (c *countingWriter) Write(p []byte) (int, error) {
	c.n += int64(len(p))
	return len(p), nil
}

func writeTar(path string, modTime time.Time, metadata []byte, dir string, files []File) (size int64, err error) {
	partial := path + ".partial"
	out, err := os.OpenFile(partial, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			_ = out.Close()
			_ = os.Remove(partial)
		}
	}()
	writer := tar.NewWriter(out)
	entry := func(name string, size int64) error {
		return writer.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: size, ModTime: modTime.UTC(), Typeflag: tar.TypeReg})
	}
	if err = entry(MetadataName, int64(len(metadata))); err != nil {
		return 0, err
	}
	if _, err = writer.Write(metadata); err != nil {
		return 0, err
	}
	for _, file := range files {
		if err = entry(file.Name, file.Size); err != nil {
			return 0, err
		}
		if err = copyFile(writer, filepath.Join(dir, file.Name)); err != nil {
			return 0, err
		}
	}
	if err = writer.Close(); err != nil {
		return 0, err
	}
	if err = out.Sync(); err != nil {
		return 0, err
	}
	info, err := out.Stat()
	if err != nil {
		return 0, err
	}
	if err = out.Close(); err != nil {
		return 0, err
	}
	if err = os.Rename(partial, path); err != nil {
		return 0, err
	}
	syncDir(filepath.Dir(path))
	return info.Size(), nil
}

func copyFile(dst io.Writer, path string) error {
	in, err := os.Open(path)
	if err != nil {
		return err
	}
	defer in.Close()
	_, err = io.Copy(dst, in)
	return err
}

func syncDir(dir string) {
	handle, err := os.Open(dir)
	if err != nil {
		return
	}
	_ = handle.Sync()
	_ = handle.Close()
}
