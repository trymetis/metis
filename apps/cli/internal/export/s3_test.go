package export

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
)

type fakeS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
	parts   map[string]map[int][]byte
	calls   []string
}

func newFakeS3(t *testing.T) (*fakeS3, string) {
	t.Helper()
	fake := &fakeS3{objects: map[string][]byte{}, parts: map[string]map[int][]byte{}}
	server := httptest.NewServer(http.HandlerFunc(fake.serve))
	t.Cleanup(server.Close)
	t.Setenv("AWS_ACCESS_KEY_ID", "test")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "test")
	t.Setenv("AWS_REGION", "us-east-1")
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(t.TempDir(), "none"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(t.TempDir(), "none"))
	return fake, server.URL
}

func (fake *fakeS3) serve(w http.ResponseWriter, r *http.Request) {
	fake.mu.Lock()
	defer fake.mu.Unlock()
	key := strings.TrimPrefix(r.URL.Path, "/")
	query := r.URL.Query()
	switch {
	case r.Method == http.MethodPost && query.Has("uploads"):
		fake.calls = append(fake.calls, "create "+key)
		fake.parts[key] = map[int][]byte{}
		_, _ = fmt.Fprintf(w, `<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>%s</Key><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>`, key)
	case r.Method == http.MethodPut && query.Has("partNumber"):
		number, _ := strconv.Atoi(query.Get("partNumber"))
		body, _ := io.ReadAll(r.Body)
		fake.calls = append(fake.calls, fmt.Sprintf("part %d", number))
		fake.parts[key][number] = body
		w.Header().Set("ETag", fmt.Sprintf(`"etag-%d"`, number))
	case r.Method == http.MethodPost && query.Has("uploadId"):
		fake.calls = append(fake.calls, "complete "+key)
		var numbers []int
		for number := range fake.parts[key] {
			numbers = append(numbers, number)
		}
		slices.Sort(numbers)
		var whole []byte
		for _, number := range numbers {
			whole = append(whole, fake.parts[key][number]...)
		}
		fake.objects[key] = whole
		_, _ = fmt.Fprintf(w, `<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>%s</Key><ETag>"whole"</ETag></CompleteMultipartUploadResult>`, key)
	case r.Method == http.MethodPut:
		body, _ := io.ReadAll(r.Body)
		fake.calls = append(fake.calls, "put "+key+" sha256="+r.Header.Get("X-Amz-Meta-Sha256"))
		fake.objects[key] = body
		w.Header().Set("ETag", `"single"`)
	case r.Method == http.MethodHead:
		body, ok := fake.objects[key]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	default:
		w.WriteHeader(http.StatusBadRequest)
	}
}

func TestParseS3(t *testing.T) {
	target, err := ParseS3("s3://backups/metis/acme/")
	if err != nil || target == nil || target.Bucket != "backups" || target.Prefix != "metis/acme/" {
		t.Fatalf("target %+v %v", target, err)
	}
	if target.URL("a.tar") != "s3://backups/metis/acme/a.tar" {
		t.Fatalf("url %s", target.URL("a.tar"))
	}
	bare, _ := ParseS3("s3://backups")
	if bare.Prefix != "" || bare.Key("a.tar") != "a.tar" {
		t.Fatalf("bare %+v", bare)
	}
	if local, err := ParseS3("./backups"); local != nil || err != nil {
		t.Fatalf("a local folder parsed as S3: %+v %v", local, err)
	}
	if _, err := ParseS3("s3:///nobucket"); err == nil {
		t.Fatal("an address without a bucket was accepted")
	}
}

func writeRandom(t *testing.T, size int) (string, []byte) {
	t.Helper()
	data := make([]byte, size)
	_, _ = rand.Read(data)
	path := filepath.Join(t.TempDir(), "metis-export-20261111T100000Z.tar")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path, data
}

func TestUploadInOnePiece(t *testing.T) {
	fake, endpoint := newFakeS3(t)
	path, data := writeRandom(t, 1000)
	url, err := Upload(context.Background(), S3Target{Bucket: "backups", Prefix: "metis/", Endpoint: endpoint}, path, "abc123")
	if err != nil {
		t.Fatal(err)
	}
	if url != "s3://backups/metis/metis-export-20261111T100000Z.tar" {
		t.Fatalf("url %s", url)
	}
	if !bytes.Equal(fake.objects["backups/metis/metis-export-20261111T100000Z.tar"], data) {
		t.Fatalf("stored %d bytes, calls %v", len(fake.objects["backups/metis/metis-export-20261111T100000Z.tar"]), fake.calls)
	}
	if fake.calls[0] != "put backups/metis/metis-export-20261111T100000Z.tar sha256=abc123" {
		t.Fatalf("calls %v", fake.calls)
	}
}

func TestUploadInParts(t *testing.T) {
	previousMax, previousPart := singleUploadMax, partSize
	singleUploadMax, partSize = 1024, 1000
	t.Cleanup(func() { singleUploadMax, partSize = previousMax, previousPart })
	fake, endpoint := newFakeS3(t)
	path, data := writeRandom(t, 2500)
	if _, err := Upload(context.Background(), S3Target{Bucket: "backups", Endpoint: endpoint}, path, "abc"); err != nil {
		t.Fatal(err)
	}
	key := "backups/metis-export-20261111T100000Z.tar"
	if !bytes.Equal(fake.objects[key], data) {
		t.Fatalf("stored %d bytes", len(fake.objects[key]))
	}
	if strings.Join(fake.calls, ",") != "create "+key+",part 1,part 2,part 3,complete "+key {
		t.Fatalf("calls %v", fake.calls)
	}
}
