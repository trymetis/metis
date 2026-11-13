package hrana

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const requestTimeout = 5 * time.Minute

type Client struct {
	endpoint string
	token    string
	host     string
	http     *http.Client
}

type Stmt struct {
	SQL  string
	Args []any
}

type Rows struct {
	Columns []string
	Rows    [][]any
}

func BaseURL(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%q is not a database URL: %w", raw, err)
	}
	switch parsed.Scheme {
	case "libsql", "wss":
		parsed.Scheme = "https"
	case "ws":
		parsed.Scheme = "http"
	case "http", "https":
	default:
		return "", fmt.Errorf("%q is not a libSQL URL; use the sqld or Turso URL (libsql://, https:// or http://)", raw)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("%q has no host", raw)
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	return parsed.String(), nil
}

func (client *Client) WithHost(host string) *Client {
	copied := *client
	copied.host = host
	return &copied
}

func New(raw, token string) (*Client, error) {
	base, err := BaseURL(raw)
	if err != nil {
		return nil, err
	}
	return &Client{endpoint: base + "/v2/pipeline", token: token, http: &http.Client{Timeout: requestTimeout}}, nil
}

type wireValue struct {
	Type   string          `json:"type"`
	Value  json.RawMessage `json:"value,omitempty"`
	Base64 *string         `json:"base64,omitempty"`
}

type wireStmt struct {
	SQL      string      `json:"sql"`
	Args     []wireValue `json:"args"`
	WantRows bool        `json:"want_rows"`
}

type wireCondition struct {
	Type string         `json:"type"`
	Step *int           `json:"step,omitempty"`
	Cond *wireCondition `json:"cond,omitempty"`
}

func okCondition(step int) *wireCondition {
	return &wireCondition{Type: "ok", Step: &step}
}

type wireStep struct {
	Stmt      wireStmt       `json:"stmt"`
	Condition *wireCondition `json:"condition,omitempty"`
}

type wireRequest struct {
	Type  string     `json:"type"`
	Stmt  *wireStmt  `json:"stmt,omitempty"`
	Batch *wireBatch `json:"batch,omitempty"`
}

type wireBatch struct {
	Steps []wireStep `json:"steps"`
}

type wireError struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

type wireResult struct {
	Cols []struct {
		Name string `json:"name"`
	} `json:"cols"`
	Rows [][]wireValue `json:"rows"`
}

type wireBatchResult struct {
	StepResults []*wireResult `json:"step_results"`
	StepErrors  []*wireError  `json:"step_errors"`
}

type wireResponse struct {
	Results []struct {
		Type     string     `json:"type"`
		Error    *wireError `json:"error"`
		Response *struct {
			Type   string          `json:"type"`
			Result json.RawMessage `json:"result"`
		} `json:"response"`
	} `json:"results"`
}

func encodeValue(value any) (wireValue, error) {
	switch typed := value.(type) {
	case nil:
		return wireValue{Type: "null"}, nil
	case int64:
		return wireValue{Type: "integer", Value: json.RawMessage(strconv.Quote(strconv.FormatInt(typed, 10)))}, nil
	case int:
		return wireValue{Type: "integer", Value: json.RawMessage(strconv.Quote(strconv.Itoa(typed)))}, nil
	case bool:
		if typed {
			return encodeValue(int64(1))
		}
		return encodeValue(int64(0))
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return wireValue{}, fmt.Errorf("%v cannot be sent to libSQL", typed)
		}
		return wireValue{Type: "float", Value: json.RawMessage(strconv.FormatFloat(typed, 'g', -1, 64))}, nil
	case string:
		quoted, err := json.Marshal(typed)
		if err != nil {
			return wireValue{}, err
		}
		return wireValue{Type: "text", Value: quoted}, nil
	case []byte:
		encoded := base64.StdEncoding.EncodeToString(typed)
		return wireValue{Type: "blob", Base64: &encoded}, nil
	default:
		return wireValue{}, fmt.Errorf("unsupported value %T", value)
	}
}

func decodeValue(value wireValue) (any, error) {
	switch value.Type {
	case "null":
		return nil, nil
	case "integer":
		var text string
		if err := json.Unmarshal(value.Value, &text); err != nil {
			return nil, err
		}
		return strconv.ParseInt(text, 10, 64)
	case "float":
		var number json.Number
		if err := json.Unmarshal(value.Value, &number); err != nil {
			return nil, err
		}
		return strconv.ParseFloat(number.String(), 64)
	case "text":
		var text string
		if err := json.Unmarshal(value.Value, &text); err != nil {
			return nil, err
		}
		return text, nil
	case "blob":
		if value.Base64 == nil {
			return []byte{}, nil
		}
		return base64.RawStdEncoding.DecodeString(strings.TrimRight(*value.Base64, "="))
	default:
		return nil, fmt.Errorf("unknown value type %q", value.Type)
	}
}

func encodeStmt(stmt Stmt) (wireStmt, error) {
	out := wireStmt{SQL: stmt.SQL, Args: []wireValue{}, WantRows: true}
	for _, arg := range stmt.Args {
		value, err := encodeValue(arg)
		if err != nil {
			return wireStmt{}, err
		}
		out.Args = append(out.Args, value)
	}
	return out, nil
}

func decodeResult(raw json.RawMessage) (Rows, error) {
	var result wireResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return Rows{}, err
	}
	rows := Rows{}
	for _, col := range result.Cols {
		rows.Columns = append(rows.Columns, col.Name)
	}
	for _, wireRow := range result.Rows {
		row := make([]any, 0, len(wireRow))
		for _, value := range wireRow {
			decoded, err := decodeValue(value)
			if err != nil {
				return Rows{}, err
			}
			row = append(row, decoded)
		}
		rows.Rows = append(rows.Rows, row)
	}
	return rows, nil
}

func (client *Client) pipeline(ctx context.Context, requests []wireRequest) (*wireResponse, error) {
	body, err := json.Marshal(map[string]any{"baton": nil, "requests": append(requests, wireRequest{Type: "close"})})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, client.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if client.host != "" {
		req.Host = client.host
	}
	if client.token != "" {
		req.Header.Set("Authorization", "Bearer "+client.token)
	}
	res, err := client.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		text := strings.TrimSpace(string(raw))
		if len(text) > 300 {
			text = text[:300]
		}
		if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
			return nil, fmt.Errorf("the database refused the token (HTTP %d): %s", res.StatusCode, text)
		}
		return nil, fmt.Errorf("the database answered HTTP %d: %s", res.StatusCode, text)
	}
	var response wireResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("reading the database's answer: %w", err)
	}
	if len(response.Results) != len(requests)+1 {
		return nil, fmt.Errorf("the database answered %d results for %d requests", len(response.Results), len(requests)+1)
	}
	return &response, nil
}

func short(sql string) string {
	sql = strings.Join(strings.Fields(sql), " ")
	if len(sql) > 120 {
		return sql[:120] + "…"
	}
	return sql
}

func (client *Client) Execute(ctx context.Context, stmts ...Stmt) ([]Rows, error) {
	requests := make([]wireRequest, 0, len(stmts))
	for _, stmt := range stmts {
		encoded, err := encodeStmt(stmt)
		if err != nil {
			return nil, err
		}
		requests = append(requests, wireRequest{Type: "execute", Stmt: &encoded})
	}
	response, err := client.pipeline(ctx, requests)
	if err != nil {
		return nil, err
	}
	out := make([]Rows, 0, len(stmts))
	for index, stmt := range stmts {
		result := response.Results[index]
		if result.Type != "ok" || result.Response == nil {
			message := "no answer"
			if result.Error != nil {
				message = result.Error.Message
			}
			return nil, fmt.Errorf("%s: %s", short(stmt.SQL), message)
		}
		rows, err := decodeResult(result.Response.Result)
		if err != nil {
			return nil, err
		}
		out = append(out, rows)
	}
	return out, nil
}

func (client *Client) Query(ctx context.Context, sql string, args ...any) (Rows, error) {
	results, err := client.Execute(ctx, Stmt{SQL: sql, Args: args})
	if err != nil {
		return Rows{}, err
	}
	return results[0], nil
}

func (client *Client) runBatch(ctx context.Context, stmts []Stmt, conditions []*wireCondition) (wireBatchResult, error) {
	steps := make([]wireStep, 0, len(stmts))
	for index, stmt := range stmts {
		encoded, err := encodeStmt(stmt)
		if err != nil {
			return wireBatchResult{}, err
		}
		steps = append(steps, wireStep{Stmt: encoded, Condition: conditions[index]})
	}
	response, err := client.pipeline(ctx, []wireRequest{{Type: "batch", Batch: &wireBatch{Steps: steps}}})
	if err != nil {
		return wireBatchResult{}, err
	}
	result := response.Results[0]
	if result.Type != "ok" || result.Response == nil {
		if result.Error != nil {
			return wireBatchResult{}, errors.New(result.Error.Message)
		}
		return wireBatchResult{}, errors.New("the database did not run the batch")
	}
	var batch wireBatchResult
	if err := json.Unmarshal(result.Response.Result, &batch); err != nil {
		return wireBatchResult{}, err
	}
	if len(batch.StepResults) != len(stmts) {
		return wireBatchResult{}, fmt.Errorf("the database answered %d steps for %d statements", len(batch.StepResults), len(stmts))
	}
	return batch, nil
}

func firstStepError(batch wireBatchResult, stmts []Stmt, until int) error {
	for index := 0; index < until && index < len(batch.StepErrors); index++ {
		if stepErr := batch.StepErrors[index]; stepErr != nil {
			return fmt.Errorf("%s: %s", short(stmts[index].SQL), stepErr.Message)
		}
	}
	return nil
}

func (client *Client) Batch(ctx context.Context, stmts []Stmt) error {
	conditions := make([]*wireCondition, len(stmts))
	for index := 1; index < len(stmts); index++ {
		conditions[index] = okCondition(index - 1)
	}
	batch, err := client.runBatch(ctx, stmts, conditions)
	if err != nil {
		return err
	}
	if err := firstStepError(batch, stmts, len(stmts)); err != nil {
		return err
	}
	if len(stmts) > 0 && batch.StepResults[len(stmts)-1] == nil {
		return errors.New("the database stopped the batch before its last statement")
	}
	return nil
}

func (client *Client) Transaction(ctx context.Context, before, body []Stmt) error {
	stmts := append(append(append([]Stmt{}, before...), Stmt{SQL: "BEGIN"}), body...)
	commit := len(stmts)
	stmts = append(stmts, Stmt{SQL: "COMMIT"}, Stmt{SQL: "ROLLBACK"})
	conditions := make([]*wireCondition, len(stmts))
	for index := 1; index <= commit; index++ {
		conditions[index] = okCondition(index - 1)
	}
	conditions[commit+1] = &wireCondition{Type: "not", Cond: okCondition(commit)}
	batch, err := client.runBatch(ctx, stmts, conditions)
	if err != nil {
		return err
	}
	if err := firstStepError(batch, stmts, commit+1); err != nil {
		return err
	}
	if batch.StepResults[commit] == nil {
		return errors.New("the database stopped the transaction before COMMIT")
	}
	return nil
}

func Int(value any) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case nil:
		return 0, nil
	default:
		return 0, fmt.Errorf("expected an integer, got %T", value)
	}
}
