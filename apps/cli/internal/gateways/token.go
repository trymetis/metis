package gateways

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type TokenEntry struct {
	Address   string `json:"address"`
	CreatedAt string `json:"createdAt,omitempty"`
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

func call(ctx context.Context, method, endpoint, adminToken string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	url := strings.TrimRight(endpoint, "/") + "/v1/tokens"
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode != http.StatusOK {
		var failure struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(raw, &failure) == nil && failure.Error != "" {
			return fmt.Errorf("%s answered %d: %s", url, res.StatusCode, failure.Error)
		}
		return fmt.Errorf("%s answered %d", url, res.StatusCode)
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func CreateToken(ctx context.Context, endpoint, adminToken, address string) (string, error) {
	var created struct {
		Token string `json:"token"`
	}
	if err := call(ctx, http.MethodPost, endpoint, adminToken, map[string]string{"address": address}, &created); err != nil {
		return "", err
	}
	return created.Token, nil
}

func RevokeToken(ctx context.Context, endpoint, adminToken, address string) error {
	return call(ctx, http.MethodDelete, endpoint, adminToken, map[string]string{"address": address}, nil)
}

func ListTokens(ctx context.Context, endpoint, adminToken string) ([]json.RawMessage, error) {
	var listed struct {
		Tokens []json.RawMessage `json:"tokens"`
	}
	if err := call(ctx, http.MethodGet, endpoint, adminToken, nil, &listed); err != nil {
		return nil, err
	}
	return listed.Tokens, nil
}

func WaitHealthy(ctx context.Context, endpoint, adminToken string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := strings.TrimRight(endpoint, "/") + "/v1/health"
	last := "no answer yet"
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+adminToken)
		res, err := httpClient.Do(req)
		if err == nil {
			_ = res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
			last = fmt.Sprintf("answered %d", res.StatusCode)
		} else {
			last = err.Error()
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s did not answer within %s (last: %s)", url, timeout, last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}
