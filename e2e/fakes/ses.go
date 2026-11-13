package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"net/mail"
	"net/textproto"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const sesPreludeDelimiter = "\x00\x00\x00\x00\x00\x00\x00\x00"

type sesSent struct {
	MessageID string   `json:"messageId"`
	From      string   `json:"from"`
	To        []string `json:"to"`
	Cc        []string `json:"cc"`
	Bcc       []string `json:"bcc"`
	Subject   string   `json:"subject"`
	Raw       string   `json:"raw"`
	At        string   `json:"at"`
}

type sesSendRequest struct {
	FromEmailAddress string `json:"FromEmailAddress"`
	Destination      struct {
		ToAddresses  []string `json:"ToAddresses"`
		CcAddresses  []string `json:"CcAddresses"`
		BccAddresses []string `json:"BccAddresses"`
	} `json:"Destination"`
	Content struct {
		Raw *struct {
			Data string `json:"Data"`
		} `json:"Raw"`
	} `json:"Content"`
}

type sesAttachment struct {
	Filename      string `json:"filename"`
	ContentType   string `json:"contentType"`
	ContentBase64 string `json:"contentBase64"`
}

type sesInboundRequest struct {
	From       string         `json:"from"`
	To         []string       `json:"to"`
	Subject    string         `json:"subject"`
	Text       string         `json:"text"`
	Spam       string         `json:"spam"`
	Virus      string         `json:"virus"`
	Attachment *sesAttachment `json:"attachment"`
}

type sesFake struct {
	domain    string
	region    string
	bucket    string
	accessKey string
	invokeURL string
	s3        *s3.Client

	invokeMu sync.Mutex
	mu       sync.Mutex
	sent     []sesSent
}

func sesMessageID() string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 40)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

func sesError(w http.ResponseWriter, status int, kind, message string) {
	w.Header().Set("x-amzn-errortype", kind)
	writeJSON(w, status, map[string]string{"message": message})
}

func (f *sesFake) api(w http.ResponseWriter, r *http.Request) {
	auth := r.Header.Get("authorization")
	if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 ") || !strings.Contains(auth, "Credential="+f.accessKey+"/") {
		sesError(w, http.StatusForbidden, "UnrecognizedClientException", "The security token included in the request is invalid.")
		return
	}
	if r.Method != http.MethodPost || r.URL.Path != "/v2/email/outbound-emails" {
		sesError(w, http.StatusNotFound, "NotFoundException", fmt.Sprintf("No route for %s %s", r.Method, r.URL.Path))
		return
	}
	var body sesSendRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content.Raw == nil {
		sesError(w, http.StatusBadRequest, "BadRequestException", "Content.Raw is required")
		return
	}
	from := strings.ToLower(body.FromEmailAddress)
	if !strings.HasSuffix(from, "@"+f.domain) {
		sesError(w, http.StatusBadRequest, "MessageRejected", "Email address is not verified. The following identities failed the check: "+body.FromEmailAddress)
		return
	}
	raw, err := base64.StdEncoding.DecodeString(body.Content.Raw.Data)
	if err != nil {
		sesError(w, http.StatusBadRequest, "BadRequestException", "Content.Raw.Data is not base64")
		return
	}
	subject := ""
	if parsed, err := mail.ReadMessage(bytes.NewReader(raw)); err == nil {
		decoded, decodeErr := new(mime.WordDecoder).DecodeHeader(parsed.Header.Get("Subject"))
		if decodeErr == nil {
			subject = decoded
		}
	}
	id := fmt.Sprintf("%016x-%s-000000", time.Now().UnixNano(), newID())
	f.mu.Lock()
	f.sent = append(f.sent, sesSent{
		MessageID: id, From: body.FromEmailAddress,
		To: nonNil(body.Destination.ToAddresses), Cc: nonNil(body.Destination.CcAddresses),
		Bcc: nonNil(body.Destination.BccAddresses), Subject: subject, Raw: string(raw),
		At: time.Now().UTC().Format(time.RFC3339Nano),
	})
	f.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"MessageId": id})
}

func nonNil(list []string) []string {
	if list == nil {
		return []string{}
	}
	return list
}

func (f *sesFake) invoke(event any) ([]byte, error) {
	payload, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	f.invokeMu.Lock()
	defer f.invokeMu.Unlock()
	client := &http.Client{Timeout: 70 * time.Second}
	res, err := client.Post(f.invokeURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("invoke answered %d: %s", res.StatusCode, body)
	}
	return body, nil
}

func (f *sesFake) functionURL(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	headers := map[string]string{}
	names := make([]string, 0, len(r.Header))
	for name := range r.Header {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if strings.EqualFold(name, "cookie") {
			continue
		}
		headers[strings.ToLower(name)] = strings.Join(r.Header.Values(name), ",")
	}
	host, _, splitErr := net.SplitHostPort(r.Host)
	if splitErr != nil {
		host = r.Host
	}
	headers["host"] = host
	cookies := []string{}
	for _, cookie := range r.Cookies() {
		cookies = append(cookies, cookie.String())
	}
	now := time.Now().UTC()
	event := map[string]any{
		"version":        "2.0",
		"routeKey":       "$default",
		"rawPath":        r.URL.Path,
		"rawQueryString": r.URL.RawQuery,
		"cookies":        cookies,
		"headers":        headers,
		"requestContext": map[string]any{
			"accountId":    "anonymous",
			"apiId":        strings.SplitN(host, ".", 2)[0],
			"domainName":   host,
			"domainPrefix": strings.SplitN(host, ".", 2)[0],
			"http": map[string]string{
				"method":    r.Method,
				"path":      r.URL.Path,
				"protocol":  "HTTP/1.1",
				"sourceIp":  "127.0.0.1",
				"userAgent": r.UserAgent(),
			},
			"requestId": newID(),
			"routeKey":  "$default",
			"stage":     "$default",
			"time":      now.Format("02/Jan/2006:15:04:05 -0700"),
			"timeEpoch": now.UnixMilli(),
		},
		"body":            base64.StdEncoding.EncodeToString(body),
		"isBase64Encoded": true,
	}
	reply, err := f.invoke(event)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	cut := bytes.Index(reply, []byte(sesPreludeDelimiter))
	if cut < 0 {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "the function did not stream an HTTP response", "reply": string(reply)})
		return
	}
	var prelude struct {
		StatusCode int               `json:"statusCode"`
		Headers    map[string]string `json:"headers"`
		Cookies    []string          `json:"cookies"`
	}
	if err := json.Unmarshal(reply[:cut], &prelude); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "unreadable response prelude: " + err.Error()})
		return
	}
	for name, value := range prelude.Headers {
		w.Header().Set(name, value)
	}
	for _, cookie := range prelude.Cookies {
		w.Header().Add("set-cookie", cookie)
	}
	if prelude.StatusCode == 0 {
		prelude.StatusCode = http.StatusOK
	}
	w.WriteHeader(prelude.StatusCode)
	_, _ = w.Write(reply[cut+len(sesPreludeDelimiter):])
}

func buildInbound(body sesInboundRequest, messageID string) ([]byte, error) {
	var buf bytes.Buffer
	header := []string{
		"From: " + body.From,
		"To: " + strings.Join(body.To, ", "),
		"Subject: " + mime.QEncoding.Encode("utf-8", body.Subject),
		"Date: " + time.Now().UTC().Format(time.RFC1123Z),
		fmt.Sprintf("Message-ID: <%s@ses.e2e.test>", messageID),
		"MIME-Version: 1.0",
	}
	if body.Attachment == nil {
		header = append(header, "Content-Type: text/plain; charset=utf-8", "", body.Text, "")
		buf.WriteString(strings.Join(header, "\r\n"))
		return buf.Bytes(), nil
	}
	content, err := base64.StdEncoding.DecodeString(body.Attachment.ContentBase64)
	if err != nil {
		return nil, err
	}
	var parts bytes.Buffer
	writer := multipart.NewWriter(&parts)
	text, err := writer.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/plain; charset=utf-8"}})
	if err != nil {
		return nil, err
	}
	_, _ = text.Write([]byte(body.Text))
	contentType := body.Attachment.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	file, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Type":              {contentType},
		"Content-Disposition":       {mime.FormatMediaType("attachment", map[string]string{"filename": body.Attachment.Filename})},
		"Content-Transfer-Encoding": {"base64"},
	})
	if err != nil {
		return nil, err
	}
	encoded := base64.StdEncoding.EncodeToString(content)
	for len(encoded) > 76 {
		_, _ = file.Write([]byte(encoded[:76] + "\r\n"))
		encoded = encoded[76:]
	}
	_, _ = file.Write([]byte(encoded + "\r\n"))
	if err := writer.Close(); err != nil {
		return nil, err
	}
	header = append(header, "Content-Type: multipart/mixed; boundary="+writer.Boundary(), "", "")
	buf.WriteString(strings.Join(header, "\r\n"))
	buf.Write(parts.Bytes())
	return buf.Bytes(), nil
}

func verdict(value string) map[string]string {
	if value == "" {
		value = "PASS"
	}
	return map[string]string{"status": strings.ToUpper(value)}
}

func (f *sesFake) inbound(w http.ResponseWriter, r *http.Request) {
	var body sesInboundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.From == "" || len(body.To) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from and to are required"})
		return
	}
	messageID := sesMessageID()
	raw, err := buildInbound(body, messageID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	_, err = f.s3.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket: aws.String(f.bucket), Key: aws.String(messageID), Body: bytes.NewReader(raw),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "storing the raw message: " + err.Error()})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	event := map[string]any{
		"Records": []any{map[string]any{
			"eventSource":  "aws:ses",
			"eventVersion": "1.0",
			"ses": map[string]any{
				"mail": map[string]any{
					"timestamp":        now,
					"source":           body.From,
					"messageId":        messageID,
					"destination":      body.To,
					"headersTruncated": false,
					"commonHeaders": map[string]any{
						"from":    []string{body.From},
						"to":      body.To,
						"subject": body.Subject,
					},
				},
				"receipt": map[string]any{
					"timestamp":            now,
					"processingTimeMillis": 1,
					"recipients":           body.To,
					"spamVerdict":          verdict(body.Spam),
					"virusVerdict":         verdict(body.Virus),
					"spfVerdict":           verdict(""),
					"dkimVerdict":          verdict(""),
					"dmarcVerdict":         verdict(""),
					"action": map[string]string{
						"type":           "Lambda",
						"functionArn":    "arn:aws:lambda:" + f.region + ":000000000000:function:metis-ses-mail",
						"invocationType": "Event",
					},
				},
			},
		}},
	}
	reply, err := f.invoke(event)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	var result any
	if err := json.Unmarshal(reply, &result); err != nil {
		result = string(reply)
	}
	writeJSON(w, http.StatusOK, map[string]any{"messageId": messageID, "result": result})
}

func (f *sesFake) objects(w http.ResponseWriter, r *http.Request) {
	keys := []string{}
	paginator := s3.NewListObjectsV2Paginator(f.s3, &s3.ListObjectsV2Input{
		Bucket: aws.String(f.bucket), Prefix: aws.String(r.URL.Query().Get("prefix")),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(r.Context())
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		for _, object := range page.Contents {
			keys = append(keys, aws.ToString(object.Key))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}

func (f *sesFake) ensureBucket(ctx context.Context) error {
	var lastErr error
	for attempt := 0; attempt < 30; attempt++ {
		_, err := f.s3.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(f.bucket)})
		var owned *types.BucketAlreadyOwnedByYou
		var exists *types.BucketAlreadyExists
		if err == nil || errors.As(err, &owned) || errors.As(err, &exists) {
			return nil
		}
		lastErr = err
		time.Sleep(time.Second)
	}
	return lastErr
}

func runSes() error {
	env, err := requireEnv("SES_DOMAIN", "SES_REGION", "SES_BUCKET", "SES_ACCESS_KEY_ID",
		"S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "LAMBDA_INVOKE_URL")
	if err != nil {
		return err
	}
	client := s3.New(s3.Options{
		Region:                     env["SES_REGION"],
		BaseEndpoint:               aws.String(env["S3_ENDPOINT"]),
		UsePathStyle:               true,
		Credentials:                credentials.NewStaticCredentialsProvider(env["S3_ACCESS_KEY"], env["S3_SECRET_KEY"], ""),
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	fake := &sesFake{
		domain:    strings.ToLower(env["SES_DOMAIN"]),
		region:    env["SES_REGION"],
		bucket:    env["SES_BUCKET"],
		accessKey: env["SES_ACCESS_KEY_ID"],
		invokeURL: env["LAMBDA_INVOKE_URL"],
		s3:        client,
		sent:      []sesSent{},
	}
	if err := fake.ensureBucket(context.Background()); err != nil {
		return fmt.Errorf("creating bucket %s: %w", fake.bucket, err)
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
		fake.sent = []sesSent{}
		fake.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	control.HandleFunc("POST /inbound", fake.inbound)
	control.HandleFunc("GET /objects", fake.objects)
	fallback(control, "GET /health | GET, DELETE /sent | POST /inbound | GET /objects?prefix=")

	errs := make(chan error, 3)
	go func() {
		errs <- serveTLS(":443", http.HandlerFunc(fake.api),
			"/tls/ses/email.us-east-1.amazonaws.com.crt", "/tls/ses/email.us-east-1.amazonaws.com.key")
	}()
	go func() { errs <- serve(":8080", control) }()
	go func() { errs <- serve(":8081", http.HandlerFunc(fake.functionURL)) }()
	log.Printf("[ses] fake SESv2 on :443 (email.%s.amazonaws.com) for @%s, control on :8080, function URL on :8081", fake.region, fake.domain)
	return firstError(errs)
}
