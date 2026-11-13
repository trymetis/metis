package gateways

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

var (
	bucketOrigin = "https://sh.trymetis.email"
	sourceOrigin = "https://raw.githubusercontent.com/trymetis/metis"
)

func fetch(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "metis/"+version.Version)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: HTTP %d", url, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, limit))
}

func checksum(sums []byte, name string) (string, error) {
	scanner := bufio.NewScanner(bytes.NewReader(sums))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == name {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("SHA256SUMS lists no %s", name)
}

func Artifact(ctx context.Context, release, name, cacheDir string) ([]byte, error) {
	folder := fmt.Sprintf("%s/v%s/", bucketOrigin, release)
	sums, err := fetch(ctx, folder+"SHA256SUMS", 64<<10)
	if err != nil {
		return nil, err
	}
	want, err := checksum(sums, name)
	if err != nil {
		return nil, err
	}
	cached := ""
	if cacheDir != "" {
		cached = filepath.Join(cacheDir, "gateways", release, name)
		if body, err := os.ReadFile(cached); err == nil {
			sum := sha256.Sum256(body)
			if hex.EncodeToString(sum[:]) == want {
				return body, nil
			}
		}
	}
	body, err := fetch(ctx, folder+name, 64<<20)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != want {
		return nil, fmt.Errorf("%s%s does not match its SHA256SUMS entry", folder, name)
	}
	if cached != "" {
		if err := os.MkdirAll(filepath.Dir(cached), 0o700); err == nil {
			_ = os.WriteFile(cached, body, 0o600)
		}
	}
	return body, nil
}

func ZipFile(archive []byte, name string) ([]byte, error) {
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return nil, err
	}
	for _, file := range reader.File {
		if file.Name != name {
			continue
		}
		opened, err := file.Open()
		if err != nil {
			return nil, err
		}
		defer opened.Close()
		return io.ReadAll(io.LimitReader(opened, 64<<20))
	}
	return nil, fmt.Errorf("the zip has no %s", name)
}

func SourceFile(ctx context.Context, release, path string) ([]byte, error) {
	return fetch(ctx, fmt.Sprintf("%s/app-v%s/%s", sourceOrigin, release, path), 1<<20)
}

var nonName = regexp.MustCompile(`[^a-z0-9]+`)

func Slug(domain string) string {
	return strings.Trim(nonName.ReplaceAllString(strings.ToLower(domain), "-"), "-")
}

func NormalizeDomain(domain string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
}
