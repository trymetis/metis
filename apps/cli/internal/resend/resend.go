package resend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

const KeyVariable = "RESEND_API_KEY"

var apiOrigin = "https://api.resend.com"

var Regions = []string{"us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"}

type Client struct {
	key  string
	http *http.Client
}

type apiError struct {
	Status  int
	Message string
}

func (err apiError) Error() string {
	return fmt.Sprintf("Resend answered %d: %s", err.Status, err.Message)
}

func New(key string) *Client {
	return &Client{key: key, http: &http.Client{Timeout: 30 * time.Second}}
}

func KeyFromEnv() string {
	return strings.TrimSpace(os.Getenv(KeyVariable))
}

func (client *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, apiOrigin+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+client.key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "metis/"+version.Version)
	res, err := client.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		var failure struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &failure)
		return apiError{Status: res.StatusCode, Message: failure.Message}
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

type Record struct {
	Record   string `json:"record"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	TTL      string `json:"ttl"`
	Status   string `json:"status"`
	Value    string `json:"value"`
	Priority int    `json:"priority"`
}

type Domain struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	Region       string   `json:"region"`
	Records      []Record `json:"records"`
	Capabilities struct {
		Sending   string `json:"sending"`
		Receiving string `json:"receiving"`
	} `json:"capabilities"`
}

func (client *Client) Domains(ctx context.Context) ([]Domain, error) {
	var listed struct {
		Data []Domain `json:"data"`
	}
	if err := client.do(ctx, http.MethodGet, "/domains", nil, &listed); err != nil {
		if failure, ok := err.(apiError); ok && (failure.Status == http.StatusUnauthorized || failure.Status == http.StatusForbidden) {
			return nil, fmt.Errorf("the Resend key cannot list domains; create a key with full access: %w", err)
		}
		return nil, err
	}
	return listed.Data, nil
}

func (client *Client) Domain(ctx context.Context, id string) (Domain, error) {
	var domain Domain
	err := client.do(ctx, http.MethodGet, "/domains/"+id, nil, &domain)
	return domain, err
}

func (client *Client) EnsureDomain(ctx context.Context, name, region string) (Domain, error) {
	domains, err := client.Domains(ctx)
	if err != nil {
		return Domain{}, err
	}
	for _, domain := range domains {
		if strings.EqualFold(domain.Name, name) {
			full, err := client.Domain(ctx, domain.ID)
			if err != nil {
				return Domain{}, err
			}
			if full.Capabilities.Receiving != "enabled" {
				if err := client.do(ctx, http.MethodPatch, "/domains/"+domain.ID, map[string]any{
					"capabilities": map[string]string{"receiving": "enabled"},
				}, nil); err != nil {
					return Domain{}, fmt.Errorf("turning on receiving for %s: %w", name, err)
				}
				return client.Domain(ctx, domain.ID)
			}
			return full, nil
		}
	}
	var created Domain
	if err := client.do(ctx, http.MethodPost, "/domains", map[string]any{
		"name":         name,
		"region":       region,
		"capabilities": map[string]string{"sending": "enabled", "receiving": "enabled"},
	}, &created); err != nil {
		return Domain{}, fmt.Errorf("adding %s to Resend: %w", name, err)
	}
	return client.Domain(ctx, created.ID)
}

func (client *Client) Verify(ctx context.Context, id string) error {
	return client.do(ctx, http.MethodPost, "/domains/"+id+"/verify", nil, nil)
}

func (client *Client) WaitVerified(ctx context.Context, id string, every, timeout time.Duration) (Domain, error) {
	deadline := time.Now().Add(timeout)
	for {
		domain, err := client.Domain(ctx, id)
		if err != nil {
			return Domain{}, err
		}
		if domain.Status == "verified" {
			return domain, nil
		}
		if time.Now().After(deadline) {
			return domain, fmt.Errorf("%s is %s", domain.Name, domain.Status)
		}
		select {
		case <-ctx.Done():
			return domain, ctx.Err()
		case <-time.After(every):
		}
	}
}

type Webhook struct {
	ID            string `json:"id"`
	SigningSecret string `json:"signing_secret"`
}

func (client *Client) CreateWebhook(ctx context.Context, endpoint string) (Webhook, error) {
	var created Webhook
	err := client.do(ctx, http.MethodPost, "/webhooks", map[string]any{
		"endpoint": endpoint,
		"events":   []string{"email.received"},
	}, &created)
	return created, err
}

func (client *Client) DeleteWebhook(ctx context.Context, id string) error {
	err := client.do(ctx, http.MethodDelete, "/webhooks/"+id, nil, nil)
	if failure, ok := err.(apiError); ok && failure.Status == http.StatusNotFound {
		return nil
	}
	return err
}

type listedWebhook struct {
	ID       string `json:"id"`
	Endpoint string `json:"endpoint"`
}

func (client *Client) DeleteWebhooksTo(ctx context.Context, endpoint string) (int, error) {
	var listed struct {
		Data []listedWebhook `json:"data"`
	}
	if err := client.do(ctx, http.MethodGet, "/webhooks", nil, &listed); err != nil {
		return 0, err
	}
	deleted := 0
	for _, webhook := range listed.Data {
		if strings.TrimRight(webhook.Endpoint, "/") == strings.TrimRight(endpoint, "/") {
			if err := client.DeleteWebhook(ctx, webhook.ID); err != nil {
				return deleted, err
			}
			deleted++
		}
	}
	return deleted, nil
}
