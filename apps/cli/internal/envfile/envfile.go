package envfile

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type line struct {
	raw   string
	key   string
	value string
}

type File struct {
	lines []line
}

func Parse(content string) (*File, error) {
	file := &File{}
	for index, raw := range strings.Split(strings.TrimSuffix(content, "\n"), "\n") {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			file.lines = append(file.lines, line{raw: raw})
			continue
		}
		key, value, ok := strings.Cut(raw, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" || strings.ContainsAny(key, " \t") {
			return nil, fmt.Errorf("line %d is not KEY=VALUE", index+1)
		}
		file.lines = append(file.lines, line{key: key, value: value})
	}
	return file, nil
}

func Read(path string) (*File, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &File{}, nil
	}
	if err != nil {
		return nil, err
	}
	file, err := Parse(string(raw))
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return file, nil
}

func (file *File) Get(key string) (string, bool) {
	for index := len(file.lines) - 1; index >= 0; index-- {
		if file.lines[index].key == key {
			return file.lines[index].value, true
		}
	}
	return "", false
}

func (file *File) Value(key string) string {
	value, _ := file.Get(key)
	return value
}

func (file *File) Set(key, value string) {
	for index := range file.lines {
		if file.lines[index].key == key {
			file.lines[index].value = value
			file.removeAfter(index, key)
			return
		}
	}
	file.lines = append(file.lines, line{key: key, value: value})
}

func (file *File) removeAfter(index int, key string) {
	kept := file.lines[:index+1]
	for _, entry := range file.lines[index+1:] {
		if entry.key != key {
			kept = append(kept, entry)
		}
	}
	file.lines = kept
}

func (file *File) Unset(key string) {
	kept := file.lines[:0]
	for _, entry := range file.lines {
		if entry.key != key {
			kept = append(kept, entry)
		}
	}
	file.lines = kept
}

func (file *File) Keys() []string {
	seen := map[string]bool{}
	var keys []string
	for _, entry := range file.lines {
		if entry.key != "" && !seen[entry.key] {
			seen[entry.key] = true
			keys = append(keys, entry.key)
		}
	}
	return keys
}

func (file *File) Map() map[string]string {
	values := map[string]string{}
	for _, entry := range file.lines {
		if entry.key != "" {
			values[entry.key] = entry.value
		}
	}
	return values
}

func (file *File) String() string {
	var out strings.Builder
	for _, entry := range file.lines {
		if entry.key == "" {
			out.WriteString(entry.raw)
		} else {
			out.WriteString(entry.key + "=" + entry.value)
		}
		out.WriteString("\n")
	}
	return out.String()
}

func (file *File) Write(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(file.String()), 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func Hash(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
