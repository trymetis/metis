package ses

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

func pipelineURL(databaseURL string) string {
	url := strings.TrimRight(databaseURL, "/")
	for _, scheme := range []string{"libsql://", "wss://"} {
		if rest, ok := strings.CutPrefix(url, scheme); ok {
			url = "https://" + rest
		}
	}
	if rest, ok := strings.CutPrefix(url, "ws://"); ok {
		url = "http://" + rest
	}
	return url + "/v2/pipeline"
}

func ApplySchema(ctx context.Context, databaseURL, token, schema string) error {
	body, err := json.Marshal(map[string]any{
		"requests": []map[string]any{
			{"type": "sequence", "sql": schema},
			{"type": "close"},
		},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, pipelineURL(databaseURL), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("reaching the database: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("the database answered %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	var result struct {
		Results []struct {
			Type  string `json:"type"`
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return err
	}
	for _, entry := range result.Results {
		if entry.Type == "error" {
			return fmt.Errorf("applying the schema: %s", entry.Error.Message)
		}
	}
	return nil
}
