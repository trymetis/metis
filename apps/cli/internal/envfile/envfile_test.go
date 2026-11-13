package envfile

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRawValuesAndRewrite(t *testing.T) {
	file, err := Parse("# comment\nA=1\nB=$HOME \"quoted\" ${X}\n\nA=2\n")
	if err != nil {
		t.Fatal(err)
	}
	if file.Value("A") != "2" || file.Value("B") != `$HOME "quoted" ${X}` {
		t.Fatalf("values %v", file.Map())
	}
	file.Set("A", "3")
	file.Set("C", "x=y")
	file.Unset("B")
	if got := file.String(); got != "# comment\nA=3\n\nC=x=y\n" {
		t.Fatalf("rewrite %q", got)
	}
	path := filepath.Join(t.TempDir(), "env", "x.env")
	if err := file.Write(path); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", info.Mode())
	}
	read, err := Read(path)
	if err != nil || read.Value("C") != "x=y" {
		t.Fatalf("read %v %v", read, err)
	}
	if _, err := Parse("not a pair\n"); err == nil {
		t.Fatal("a line without = parsed")
	}
}
