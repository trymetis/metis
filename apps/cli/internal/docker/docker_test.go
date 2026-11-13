package docker

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadOSRelease(t *testing.T) {
	dir := t.TempDir()
	for _, tc := range []struct {
		content string
		want    osRelease
	}{
		{"ID=debian\nVERSION_CODENAME=trixie\n", osRelease{ID: "debian", Codename: "trixie"}},
		{"ID=ubuntu\nVERSION_CODENAME=noble\nUBUNTU_CODENAME=noble\n", osRelease{ID: "ubuntu", Codename: "noble"}},
		{"ID=\"linuxmint\"\nUBUNTU_CODENAME=noble\nVERSION_CODENAME=wilma\n", osRelease{ID: "linuxmint", Codename: "wilma"}},
	} {
		path := filepath.Join(dir, "os-release")
		if err := os.WriteFile(path, []byte(tc.content), 0o644); err != nil {
			t.Fatal(err)
		}
		got, err := readOSRelease(path)
		if err != nil || got != tc.want {
			t.Fatalf("%q: got %+v, %v", tc.content, got, err)
		}
	}
}
