package sqld

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	Container = "metis-sqld"
	AdminPort = "9090/tcp"
)

var Namespaces = []string{"app", "mastra"}

const ResendNamespace = "resend"

var httpClient = &http.Client{Timeout: 15 * time.Second}

func CreateNamespace(ctx context.Context, adminAddr, adminKey, name string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("http://%s/v1/namespaces/%s/create", adminAddr, name), strings.NewReader("{}"))
	if err != nil {
		return err
	}
	request.Header.Set("authorization", "basic "+adminKey)
	request.Header.Set("content-type", "application/json")
	response, err := httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("reaching sqld's admin API on %s: %w", adminAddr, err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode == http.StatusOK || strings.Contains(string(body), "already exists") {
		return nil
	}
	return fmt.Errorf("creating the sqld namespace %s: HTTP %d: %s", name, response.StatusCode, strings.TrimSpace(string(body)))
}

func CreateNamespaces(ctx context.Context, adminAddr, adminKey string, names ...string) error {
	if adminKey == "" {
		return fmt.Errorf("SQLD_ADMIN_KEY is not set, so the sqld namespaces cannot be created")
	}
	for _, name := range names {
		if err := CreateNamespace(ctx, adminAddr, adminKey, name); err != nil {
			return err
		}
	}
	return nil
}

func DeleteNamespace(ctx context.Context, adminAddr, adminKey, name string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, fmt.Sprintf("http://%s/v1/namespaces/%s", adminAddr, name), nil)
	if err != nil {
		return err
	}
	request.Header.Set("authorization", "basic "+adminKey)
	response, err := httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("reaching sqld's admin API on %s: %w", adminAddr, err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	if response.StatusCode == http.StatusOK || response.StatusCode == http.StatusNotFound || strings.Contains(string(body), "does not exist") {
		return nil
	}
	return fmt.Errorf("deleting the sqld namespace %s: HTTP %d: %s", name, response.StatusCode, strings.TrimSpace(string(body)))
}
