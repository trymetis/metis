package archive

import (
	"archive/tar"
	"bytes"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/keys"
)

var createdAt = time.Date(2026, 11, 11, 10, 0, 0, 0, time.UTC)

func identity(t *testing.T) (*ecdh.PrivateKey, *keys.Public) {
	t.Helper()
	private, err := keys.Generate()
	if err != nil {
		t.Fatal(err)
	}
	return private, &keys.Public{Key: private.PublicKey()}
}

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	data := make([]byte, n)
	if _, err := rand.Read(data); err != nil {
		t.Fatal(err)
	}
	return data
}

func writeSource(t *testing.T, dir, name string, data []byte) Source {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return Source{Name: name, Path: path}
}

type fixture struct {
	dir    string
	path   string
	inputs map[string][]byte
}

func build(t *testing.T, recipients []*keys.Public, inputs map[string][]byte) fixture {
	t.Helper()
	dir := t.TempDir()
	sources := filepath.Join(dir, "plain")
	if err := os.Mkdir(sources, 0o700); err != nil {
		t.Fatal(err)
	}
	var files []Source
	for _, name := range []string{App, Mastra, BootEnv} {
		if data, ok := inputs[name]; ok {
			files = append(files, writeSource(t, sources, name, data))
		}
	}
	since := createdAt.Add(-2 * time.Minute)
	path, size, err := Write(Spec{
		Dir: dir, CreatedAt: createdAt, AppVersion: "1.4.0", Migration: "0009_mail_signatures", Source: "turso",
		MaintenanceSince: &since, Recipients: recipients, Files: files,
	})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "metis-export-20261111T100000Z.tar" {
		t.Fatalf("path %s", path)
	}
	if info, err := os.Stat(path); err != nil || info.Size() != size {
		t.Fatalf("size %d stat %v %v", size, info, err)
	}
	if leftovers, _ := filepath.Glob(filepath.Join(dir, TempPrefix+"*")); len(leftovers) != 0 {
		t.Fatalf("temporary folders left behind: %v", leftovers)
	}
	if _, err := os.Stat(path + ".partial"); err == nil {
		t.Fatal("the partial archive was left behind")
	}
	return fixture{dir: dir, path: path, inputs: inputs}
}

func standardInputs(t *testing.T) map[string][]byte {
	return map[string][]byte{
		App:     randomBytes(t, 200_000),
		Mastra:  bytes.Repeat([]byte("mastra row\n"), 10_000),
		BootEnv: []byte("BETTER_AUTH_URL=https://mail.example.com\nMETIS_OWNER_EMAIL=owner@example.com\n"),
	}
}

func expectExtract(t *testing.T, fx fixture, id Identity) {
	t.Helper()
	out := t.TempDir()
	written, err := Extract(fx.path, id, out)
	if err != nil {
		t.Fatal(err)
	}
	for name, want := range fx.inputs {
		got, err := os.ReadFile(filepath.Join(out, PlainName(name)))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want) {
			t.Fatalf("%s differs after the round trip", name)
		}
		if written[name] != filepath.Join(out, PlainName(name)) {
			t.Fatalf("written %v", written)
		}
		info, _ := os.Stat(written[name])
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode %v", name, info.Mode())
		}
	}
}

func expectFailure(t *testing.T, path string, id Identity, contains string) {
	t.Helper()
	out := t.TempDir()
	_, err := Extract(path, id, out)
	if err == nil || !strings.Contains(err.Error(), contains) {
		t.Fatalf("want an error containing %q, got %v", contains, err)
	}
	if entries, _ := os.ReadDir(out); len(entries) != 0 {
		t.Fatalf("a failed extract left %d files", len(entries))
	}
}

func TestRoundTripWithOneRecipient(t *testing.T) {
	private, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	expectExtract(t, fx, Identity{Key: private})

	meta, problems, err := Inspect(fx.path)
	if err != nil || len(problems) != 0 {
		t.Fatalf("inspect %v %v", problems, err)
	}
	header := meta.Header
	if header.AppVersion != "1.4.0" || header.Migration != "0009_mail_signatures" || header.Source != "turso" ||
		header.CreatedAt != "2026-11-11T10:00:00Z" || header.MaintenanceSince == nil || *header.MaintenanceSince != "2026-11-11T09:58:00Z" {
		t.Fatalf("header %+v", header)
	}
	if strings.Join(header.Files, ",") != App+","+Mastra+","+BootEnv || len(meta.Files) != 3 {
		t.Fatalf("files %v %v", header.Files, meta.Files)
	}
	if meta.Fingerprints()[0] != keys.Fingerprint(public.Key) {
		t.Fatalf("fingerprints %v", meta.Fingerprints())
	}
}

func TestRoundTripWithThreeRecipients(t *testing.T) {
	var privates []*ecdh.PrivateKey
	var publics []*keys.Public
	for range 3 {
		private, public := identity(t)
		privates = append(privates, private)
		publics = append(publics, public)
	}
	fx := build(t, publics, standardInputs(t))
	for _, private := range privates {
		expectExtract(t, fx, Identity{Key: private})
	}
}

func TestPassphraseRecipient(t *testing.T) {
	kdf := keys.KDF{Name: keys.KDFName, T: 1, M: 1024, P: 1, Salt: randomBytes(t, 16)}
	derived, err := keys.Derive("a long passphrase for tests", kdf)
	if err != nil {
		t.Fatal(err)
	}
	_, other := identity(t)
	fx := build(t, []*keys.Public{other, {Key: derived.PublicKey(), KDF: &kdf}}, standardInputs(t))
	expectExtract(t, fx, Identity{Passphrase: "a long passphrase for tests"})
	expectFailure(t, fx.path, Identity{Passphrase: "the wrong passphrase"}, "the passphrase does not open this export")

	meta, err := ReadMetadata(fx.path)
	if err != nil {
		t.Fatal(err)
	}
	stored := meta.Header.Recipients[1].KDF
	if stored == nil || stored.T != 1 || stored.M != 1024 || stored.P != 1 || !bytes.Equal(stored.Salt, kdf.Salt) || meta.Header.Recipients[0].KDF != nil {
		t.Fatalf("recipients %+v", meta.Header.Recipients)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, meta.RawHeader); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(compact.String(), `"kdf":{"name":"argon2id","t":1,"m":1024,"p":1,"salt":"`) {
		t.Fatalf("raw header %s", compact.String())
	}
}

func TestWrongIdentityIsRefused(t *testing.T) {
	_, public := identity(t)
	stranger, _ := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	expectFailure(t, fx.path, Identity{Key: stranger}, "is not a recipient of this export")
	expectFailure(t, fx.path, Identity{Passphrase: "anything"}, "no passphrase recipient")
}

func TestEmptyFileRoundTrips(t *testing.T) {
	private, public := identity(t)
	inputs := standardInputs(t)
	inputs[BootEnv] = []byte{}
	fx := build(t, []*keys.Public{public}, inputs)
	expectExtract(t, fx, Identity{Key: private})
}

type entryEdit func(name string, data []byte) []byte

func rewrite(t *testing.T, path string, edit entryEdit) string {
	t.Helper()
	in, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer in.Close()
	reader := tar.NewReader(in)
	var out bytes.Buffer
	writer := tar.NewWriter(&out)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(reader)
		data = edit(header.Name, data)
		header.Size = int64(len(data))
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		_, _ = writer.Write(data)
	}
	_ = writer.Close()
	edited := filepath.Join(t.TempDir(), "edited.tar")
	if err := os.WriteFile(edited, out.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	return edited
}

const sealedChunk = chunkSize + 16

func TestTruncatedEntryIsRefused(t *testing.T) {
	private, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	edited := rewrite(t, fx.path, func(name string, data []byte) []byte {
		if name != App {
			return data
		}
		if len(data) <= 2*sealedChunk {
			t.Fatalf("the test entry has only %d bytes", len(data))
		}
		return data[:2*sealedChunk]
	})
	expectFailure(t, edited, Identity{Key: private}, "is truncated")
	if _, problems, _ := Inspect(edited); len(problems) == 0 {
		t.Fatal("inspect missed the truncation")
	}
}

func TestReorderedChunksAreRefused(t *testing.T) {
	private, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	edited := rewrite(t, fx.path, func(name string, data []byte) []byte {
		if name != App {
			return data
		}
		swapped := append([]byte{}, data[sealedChunk:2*sealedChunk]...)
		swapped = append(swapped, data[:sealedChunk]...)
		return append(swapped, data[2*sealedChunk:]...)
	})
	expectFailure(t, edited, Identity{Key: private}, "failed authentication")
}

func TestEditedHeaderIsRefused(t *testing.T) {
	private, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	edited := rewrite(t, fx.path, func(name string, data []byte) []byte {
		if name != MetadataName {
			return data
		}
		return bytes.Replace(data, []byte(`"appVersion": "1.4.0"`), []byte(`"appVersion": "9.9.9"`), 1)
	})
	if meta, err := ReadMetadata(edited); err != nil || meta.Header.AppVersion != "9.9.9" {
		t.Fatalf("the edit did not land: %v", err)
	}
	expectFailure(t, edited, Identity{Key: private}, "could not be unwrapped")
}

func TestEditedFileListIsRefusedByInspect(t *testing.T) {
	_, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	edited := rewrite(t, fx.path, func(name string, data []byte) []byte {
		if name != Mastra {
			return data
		}
		data[len(data)/2] ^= 0xff
		return data
	})
	_, problems, err := Inspect(edited)
	if err != nil || len(problems) != 1 || !strings.Contains(problems[0], Mastra) {
		t.Fatalf("problems %v %v", problems, err)
	}
}

func TestNotAnExport(t *testing.T) {
	path := filepath.Join(t.TempDir(), "other.tar")
	var out bytes.Buffer
	writer := tar.NewWriter(&out)
	_ = writer.WriteHeader(&tar.Header{Name: "readme.txt", Mode: 0o600, Size: 2})
	_, _ = writer.Write([]byte("hi"))
	_ = writer.Close()
	_ = os.WriteFile(path, out.Bytes(), 0o600)
	if _, err := ReadMetadata(path); err == nil || !strings.Contains(err.Error(), "is not a Metis export") {
		t.Fatalf("err %v", err)
	}
	newer := filepath.Join(t.TempDir(), "newer.tar")
	out.Reset()
	writer = tar.NewWriter(&out)
	meta, _ := json.Marshal(map[string]any{"format": "metis-export/v2", "header": map[string]any{}})
	_ = writer.WriteHeader(&tar.Header{Name: MetadataName, Mode: 0o600, Size: int64(len(meta))})
	_, _ = writer.Write(meta)
	_ = writer.Close()
	_ = os.WriteFile(newer, out.Bytes(), 0o600)
	if _, err := ReadMetadata(newer); err == nil || !strings.Contains(err.Error(), "newer CLI") {
		t.Fatalf("err %v", err)
	}
}

func TestExtractRefusesToOverwrite(t *testing.T) {
	private, public := identity(t)
	fx := build(t, []*keys.Public{public}, standardInputs(t))
	out := t.TempDir()
	_ = os.WriteFile(filepath.Join(out, "app.sqlite"), []byte("mine"), 0o600)
	if _, err := Extract(fx.path, Identity{Key: private}, out); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("err %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(out, "app.sqlite")); string(data) != "mine" {
		t.Fatal("an existing file was overwritten")
	}
}

func TestCleanStale(t *testing.T) {
	dir := t.TempDir()
	stale, err := TempDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(stale, "app.sqlite"), []byte("plain"), 0o600)
	keep := filepath.Join(dir, "metis-export-20261111T100000Z.tar")
	_ = os.WriteFile(keep, []byte("x"), 0o600)
	if info, _ := os.Stat(stale); info.Mode().Perm() != 0o700 {
		t.Fatalf("temporary folder mode %v", info.Mode())
	}
	if err := CleanStale(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stale); err == nil {
		t.Fatal("a stale temporary folder survived")
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatal("an archive was removed")
	}
}

func chunkRoundTrip(t *testing.T, plain []byte) []byte {
	t.Helper()
	aead, err := fileAEAD(randomBytes(t, 32), App)
	if err != nil {
		t.Fatal(err)
	}
	aad := []byte("header")
	var sealed bytes.Buffer
	seal := newSealer(aead, aad, &sealed)
	if _, err := seal.Write(plain); err != nil {
		t.Fatal(err)
	}
	if err := seal.Close(); err != nil {
		t.Fatal(err)
	}
	ciphertext := append([]byte{}, sealed.Bytes()...)
	opened, err := io.ReadAll(newOpener(aead, aad, &sealed, App))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(opened, plain) {
		t.Fatal("the chunks did not round trip")
	}
	return ciphertext
}

func TestChunkBoundaries(t *testing.T) {
	if sealed := chunkRoundTrip(t, nil); len(sealed) != 16 {
		t.Fatalf("an empty file is %d bytes, want one empty last chunk", len(sealed))
	}
	if sealed := chunkRoundTrip(t, randomBytes(t, chunkSize)); len(sealed) != sealedChunk {
		t.Fatalf("a one-chunk file is %d bytes", len(sealed))
	}
	if sealed := chunkRoundTrip(t, randomBytes(t, chunkSize+1)); len(sealed) != sealedChunk+17 {
		t.Fatalf("a chunk and one byte is %d bytes", len(sealed))
	}
	if sealed := chunkRoundTrip(t, randomBytes(t, 3*chunkSize)); len(sealed) != 3*sealedChunk {
		t.Fatalf("three chunks are %d bytes", len(sealed))
	}
}

func TestDroppingTheLastOfManyChunksIsCaught(t *testing.T) {
	aead, _ := fileAEAD(randomBytes(t, 32), App)
	var sealed bytes.Buffer
	seal := newSealer(aead, nil, &sealed)
	_, _ = seal.Write(randomBytes(t, 3*chunkSize))
	_ = seal.Close()
	truncated := bytes.NewReader(sealed.Bytes()[:2*sealedChunk])
	if _, err := io.ReadAll(newOpener(aead, nil, truncated, App)); err == nil || !strings.Contains(err.Error(), "is truncated") {
		t.Fatalf("err %v", err)
	}
	if _, err := io.ReadAll(newOpener(aead, nil, bytes.NewReader(nil), App)); err == nil || !strings.Contains(err.Error(), "is truncated") {
		t.Fatalf("empty stream: %v", err)
	}
}
