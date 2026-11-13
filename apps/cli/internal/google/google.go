package google

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"time"
)

var APIs = []string{"gmail.googleapis.com", "calendar-json.googleapis.com", "drive.googleapis.com", "people.googleapis.com"}

var Scopes = []string{
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/calendar",
	"https://www.googleapis.com/auth/drive",
	"https://www.googleapis.com/auth/contacts",
}

const ClientIDSuffix = ".apps.googleusercontent.com"

var tokenURL = "https://oauth2.googleapis.com/token"

func ConsoleURL(page, project string) string {
	return "https://console.cloud.google.com/" + page + "?project=" + url.QueryEscape(project)
}

func RedirectURI(authURL string) string {
	return strings.TrimRight(authURL, "/") + "/api/connections/google/callback"
}

func GcloudToken(ctx context.Context) (string, bool) {
	path, err := exec.LookPath("gcloud")
	if err != nil {
		return "", false
	}
	out, err := exec.CommandContext(ctx, path, "auth", "print-access-token").Output()
	if err != nil {
		return "", false
	}
	token := strings.TrimSpace(string(out))
	return token, token != ""
}

type API struct {
	token string
	http  *http.Client
}

func NewAPI(token string) *API {
	return &API{token: token, http: &http.Client{Timeout: 30 * time.Second}}
}

func (api *API) do(ctx context.Context, method, url string, body, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+api.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := api.http.Do(req)
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
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &failure)
		return fmt.Errorf("%s answered %d: %s", url, res.StatusCode, failure.Error.Message)
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

type operation struct {
	Name  string `json:"name"`
	Done  bool   `json:"done"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (api *API) wait(ctx context.Context, base string, op operation) error {
	deadline := time.Now().Add(3 * time.Minute)
	for !op.Done {
		if time.Now().After(deadline) {
			return fmt.Errorf("%s did not finish within 3 minutes", op.Name)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
		if err := api.do(ctx, http.MethodGet, base+"/"+op.Name, nil, &op); err != nil {
			return err
		}
	}
	if op.Error != nil {
		return errors.New(op.Error.Message)
	}
	return nil
}

func NewProjectID() string {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	for index := range buf {
		buf[index] = letters[int(buf[index])%len(letters)]
	}
	return "metis-" + string(buf)
}

func (api *API) CreateProject(ctx context.Context, id string) error {
	const base = "https://cloudresourcemanager.googleapis.com/v3"
	var op operation
	if err := api.do(ctx, http.MethodPost, base+"/projects", map[string]string{"projectId": id, "displayName": "Metis"}, &op); err != nil {
		return fmt.Errorf("creating the project %s: %w", id, err)
	}
	return api.wait(ctx, base, op)
}

func (api *API) EnableAPIs(ctx context.Context, project string) error {
	const base = "https://serviceusage.googleapis.com/v1"
	var op operation
	if err := api.do(ctx, http.MethodPost, base+"/projects/"+url.PathEscape(project)+"/services:batchEnable", map[string]any{"serviceIds": APIs}, &op); err != nil {
		return fmt.Errorf("turning on the APIs: %w", err)
	}
	return api.wait(ctx, base, op)
}

func CheckClient(ctx context.Context, clientID, secret, redirect string) error {
	if !strings.HasSuffix(clientID, ClientIDSuffix) {
		return fmt.Errorf("a Google client ID ends in %s", ClientIDSuffix)
	}
	form := url.Values{
		"client_id":     {clientID},
		"client_secret": {secret},
		"code":          {"metis-cli-check"},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirect},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var answer struct {
		Error string `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&answer)
	switch answer.Error {
	case "invalid_grant":
		return nil
	case "invalid_client", "unauthorized_client":
		return errors.New("Google does not accept this client ID and secret")
	}
	return fmt.Errorf("Google answered %q to the check", answer.Error)
}
