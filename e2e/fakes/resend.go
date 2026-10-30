package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	resendPublicURL = "https://api.resend.com"
	resendDomainID  = "dom_e2e"
)

type sentEmail struct {
	ID      string            `json:"id"`
	From    string            `json:"from"`
	To      []string          `json:"to"`
	Cc      []string          `json:"cc"`
	Bcc     []string          `json:"bcc"`
	Subject string            `json:"subject"`
	HTML    *string           `json:"html"`
	Text    *string           `json:"text"`
	Headers map[string]string `json:"headers"`
	At      string            `json:"at"`
}

type rawLink struct {
	DownloadURL string `json:"download_url"`
	ExpiresAt   string `json:"expires_at"`
}

type receivedEmail struct {
	Object      string            `json:"object"`
	ID          string            `json:"id"`
	To          []string          `json:"to"`
	From        string            `json:"from"`
	Cc          []string          `json:"cc"`
	Bcc         []string          `json:"bcc"`
	ReplyTo     []string          `json:"reply_to"`
	ReceivedFor []string          `json:"received_for"`
	Subject     string            `json:"subject"`
	CreatedAt   string            `json:"created_at"`
	MessageID   string            `json:"message_id"`
	HTML        *string           `json:"html"`
	Text        string            `json:"text"`
	Headers     map[string]string `json:"headers"`
	Raw         rawLink           `json:"raw"`
	Attachments []any             `json:"attachments"`
}

type recipients []string

func (r *recipients) UnmarshalJSON(data []byte) error {
	var one string
	if err := json.Unmarshal(data, &one); err == nil {
		*r = recipients{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(data, &many); err != nil {
		return err
	}
	*r = many
	return nil
}

type sendRequest struct {
	From    string            `json:"from"`
	To      recipients        `json:"to"`
	Cc      recipients        `json:"cc"`
	Bcc     recipients        `json:"bcc"`
	Subject *string           `json:"subject"`
	HTML    *string           `json:"html"`
	Text    *string           `json:"text"`
	Headers map[string]string `json:"headers"`
}

type inboundRequest struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Subject string `json:"subject"`
	Text    string `json:"text"`
}

type resendFake struct {
	apiKey        string
	domain        string
	webhookURL    string
	webhookSecret string

	mu       sync.Mutex
	sent     []sentEmail
	received []receivedEmail
	raws     map[string]string
}

var (
	resendRawPath     = regexp.MustCompile(`^/raw/([^/]+)$`)
	resendReceivedOne = regexp.MustCompile(`^/emails/receiving/([^/]+)$`)
)

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func resendError(w http.ResponseWriter, status int, name, message string) {
	writeJSON(w, status, map[string]any{
		"statusCode": status,
		"name":       name,
		"message":    message,
	})
}

func orEmpty(list recipients) []string {
	if list == nil {
		return []string{}
	}
	return list
}

func (f *resendFake) domainBody() map[string]any {
	return map[string]any{
		"id":           resendDomainID,
		"name":         f.domain,
		"status":       "verified",
		"created_at":   time.Unix(0, 0).UTC().Format(time.RFC3339),
		"region":       "us-east-1",
		"records":      []any{},
		"capabilities": map[string]string{"sending": "enabled", "receiving": "enabled"},
	}
}

func (f *resendFake) api(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimRight(r.URL.Path, "/")

	if m := resendRawPath.FindStringSubmatch(path); m != nil && r.Method == http.MethodGet {
		f.mu.Lock()
		raw, ok := f.raws[m[1]]
		f.mu.Unlock()
		if !ok {
			resendError(w, http.StatusNotFound, "not_found", "Raw message not found")
			return
		}
		w.Header().Set("content-type", "message/rfc822")
		_, _ = w.Write([]byte(raw))
		return
	}

	if r.Header.Get("authorization") != "Bearer "+f.apiKey {
		resendError(w, http.StatusUnauthorized, "validation_error", "API key is invalid")
		return
	}

	switch {
	case r.Method == http.MethodPost && path == "/emails":
		var body sendRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.From == "" || body.Subject == nil {
			resendError(w, http.StatusUnprocessableEntity, "validation_error", "from and subject are required")
			return
		}
		id := newID()
		headers := body.Headers
		if headers == nil {
			headers = map[string]string{}
		}
		f.mu.Lock()
		f.sent = append(f.sent, sentEmail{
			ID: id, From: body.From, To: orEmpty(body.To), Cc: orEmpty(body.Cc),
			Bcc: orEmpty(body.Bcc), Subject: *body.Subject, HTML: body.HTML,
			Text: body.Text, Headers: headers,
			At: time.Now().UTC().Format(time.RFC3339Nano),
		})
		f.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]string{"id": id})
	case r.Method == http.MethodGet && path == "/domains":
		writeJSON(w, http.StatusOK, map[string]any{
			"object": "list", "has_more": false, "data": []any{f.domainBody()},
		})
	case r.Method == http.MethodGet && path == "/domains/"+resendDomainID:
		body := f.domainBody()
		body["object"] = "domain"
		writeJSON(w, http.StatusOK, body)
	case r.Method == http.MethodGet && path == "/emails/receiving":
		f.listReceived(w, r)
	case r.Method == http.MethodGet && resendReceivedOne.MatchString(path):
		id := resendReceivedOne.FindStringSubmatch(path)[1]
		f.mu.Lock()
		defer f.mu.Unlock()
		for _, email := range f.received {
			if email.ID == id {
				writeJSON(w, http.StatusOK, email)
				return
			}
		}
		resendError(w, http.StatusNotFound, "not_found", "Email not found")
	default:
		resendError(w, http.StatusNotFound, "not_found", fmt.Sprintf("No route for %s %s", r.Method, path))
	}
}

func (f *resendFake) listReceived(w http.ResponseWriter, r *http.Request) {
	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || limit <= 0 {
		limit = 20
	}
	after := r.URL.Query().Get("after")
	f.mu.Lock()
	defer f.mu.Unlock()
	newest := make([]receivedEmail, 0, len(f.received))
	for i := len(f.received) - 1; i >= 0; i-- {
		newest = append(newest, f.received[i])
	}
	start := 0
	if after != "" {
		for i, email := range newest {
			if email.ID == after {
				start = i + 1
				break
			}
		}
	}
	end := min(start+limit, len(newest))
	data := []map[string]string{}
	if start < end {
		for _, email := range newest[start:end] {
			data = append(data, map[string]string{"id": email.ID})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list", "has_more": end < len(newest), "data": data,
	})
}

func (f *resendFake) signature(id string, timestamp int64, body []byte) string {
	key, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(f.webhookSecret, "whsec_"))
	mac := hmac.New(sha256.New, key)
	fmt.Fprintf(mac, "%s.%d.", id, timestamp)
	mac.Write(body)
	return "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func (f *resendFake) deliverWebhook(emailID string) (int, error) {
	body, err := json.Marshal(map[string]any{
		"type":       "email.received",
		"created_at": time.Now().UTC().Format(time.RFC3339Nano),
		"data":       map[string]string{"email_id": emailID},
	})
	if err != nil {
		return 0, err
	}
	id := "msg_" + newID()
	timestamp := time.Now().Unix()
	req, err := http.NewRequest(http.MethodPost, f.webhookURL, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("svix-id", id)
	req.Header.Set("svix-timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("svix-signature", f.signature(id, timestamp, body))
	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	return res.StatusCode, nil
}

func (f *resendFake) inbound(w http.ResponseWriter, r *http.Request) {
	var body inboundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.From == "" || body.To == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from, to, subject and text are required"})
		return
	}
	id := newID()
	messageID := fmt.Sprintf("<%s@updates.demo.trymetis.email>", id)
	created := time.Now().UTC()
	raw := strings.Join([]string{
		"From: " + body.From,
		"To: " + body.To,
		"Subject: " + body.Subject,
		"Date: " + created.Format(time.RFC1123Z),
		"Message-ID: " + messageID,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		body.Text,
		"",
	}, "\r\n")
	f.mu.Lock()
	f.raws[id] = raw
	f.received = append(f.received, receivedEmail{
		Object: "email", ID: id, To: []string{body.To}, From: body.From,
		Cc: []string{}, Bcc: []string{}, ReplyTo: []string{},
		ReceivedFor: []string{body.To}, Subject: body.Subject,
		CreatedAt: created.Format(time.RFC3339Nano), MessageID: messageID,
		Text: body.Text, Headers: map[string]string{"message-id": messageID},
		Raw: rawLink{
			DownloadURL: resendPublicURL + "/raw/" + id,
			ExpiresAt:   created.Add(time.Hour).Format(time.RFC3339Nano),
		},
		Attachments: []any{},
	})
	f.mu.Unlock()
	status, err := f.deliverWebhook(id)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "webhook": status})
}

func runResend() error {
	env, err := requireEnv("RESEND_API_KEY", "RESEND_DOMAIN", "RESEND_WEBHOOK_URL", "RESEND_WEBHOOK_SECRET")
	if err != nil {
		return err
	}
	fake := &resendFake{
		apiKey:        env["RESEND_API_KEY"],
		domain:        strings.ToLower(env["RESEND_DOMAIN"]),
		webhookURL:    env["RESEND_WEBHOOK_URL"],
		webhookSecret: env["RESEND_WEBHOOK_SECRET"],
		sent:          []sentEmail{},
		received:      []receivedEmail{},
		raws:          map[string]string{},
	}

	control := http.NewServeMux()
	healthRoute(control)
	control.HandleFunc("GET /sent", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		defer fake.mu.Unlock()
		writeJSON(w, http.StatusOK, fake.sent)
	})
	control.HandleFunc("DELETE /sent", func(w http.ResponseWriter, _ *http.Request) {
		fake.mu.Lock()
		fake.sent = []sentEmail{}
		fake.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	control.HandleFunc("POST /inbound", fake.inbound)
	fallback(control, "GET /health | GET, DELETE /sent | POST /inbound")

	errs := make(chan error, 2)
	go func() {
		errs <- serveTLS(":443", http.HandlerFunc(fake.api),
			"/tls/resend/api.resend.com.crt", "/tls/resend/api.resend.com.key")
	}()
	go func() { errs <- serve(":8080", control) }()
	log.Printf("[resend] fake Resend API on :443 (api.resend.com) for @%s, control on :8080", fake.domain)
	return firstError(errs)
}
