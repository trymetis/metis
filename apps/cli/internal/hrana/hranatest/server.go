package hranatest

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

type value struct {
	Type   string          `json:"type"`
	Value  json.RawMessage `json:"value,omitempty"`
	Base64 *string         `json:"base64,omitempty"`
}

type stmt struct {
	SQL  string  `json:"sql"`
	Args []value `json:"args"`
}

type condition struct {
	Type  string       `json:"type"`
	Step  *int         `json:"step"`
	Cond  *condition   `json:"cond"`
	Conds []*condition `json:"conds"`
}

type step struct {
	Stmt      stmt       `json:"stmt"`
	Condition *condition `json:"condition"`
}

type request struct {
	Type  string `json:"type"`
	Stmt  *stmt  `json:"stmt"`
	Batch *struct {
		Steps []step `json:"steps"`
	} `json:"batch"`
}

type column struct {
	Name string `json:"name"`
}

type result struct {
	Cols []column  `json:"cols"`
	Rows [][]value `json:"rows"`
}

type failure struct {
	Message string `json:"message"`
}

type Server struct {
	URL      string
	DB       *sql.DB
	Token    string
	Requests int
}

func New(t testing.TB, path, token string) *Server {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	server := &Server{DB: db, Token: token}
	handler := http.NewServeMux()
	handler.HandleFunc("POST /v2/pipeline", server.pipeline)
	httpServer := httptest.NewServer(handler)
	t.Cleanup(func() {
		httpServer.Close()
		_ = db.Close()
	})
	server.URL = httpServer.URL
	return server
}

func decode(in value) (any, error) {
	switch in.Type {
	case "null":
		return nil, nil
	case "integer":
		var text string
		if err := json.Unmarshal(in.Value, &text); err != nil {
			return nil, err
		}
		return strconv.ParseInt(text, 10, 64)
	case "float":
		var number float64
		err := json.Unmarshal(in.Value, &number)
		return number, err
	case "text":
		var text string
		err := json.Unmarshal(in.Value, &text)
		return text, err
	case "blob":
		if in.Base64 == nil {
			return []byte{}, nil
		}
		return base64.RawStdEncoding.DecodeString(strings.TrimRight(*in.Base64, "="))
	}
	return nil, fmt.Errorf("unknown type %q", in.Type)
}

func encode(in any) (value, error) {
	switch typed := in.(type) {
	case nil:
		return value{Type: "null"}, nil
	case int64:
		return value{Type: "integer", Value: json.RawMessage(strconv.Quote(strconv.FormatInt(typed, 10)))}, nil
	case float64:
		return value{Type: "float", Value: json.RawMessage(strconv.FormatFloat(typed, 'g', -1, 64))}, nil
	case string:
		raw, err := json.Marshal(typed)
		return value{Type: "text", Value: raw}, err
	case []byte:
		encoded := base64.RawStdEncoding.EncodeToString(typed)
		return value{Type: "blob", Base64: &encoded}, nil
	}
	return value{}, fmt.Errorf("the fake server cannot send %T", in)
}

func run(ctx context.Context, conn *sql.Conn, in stmt) (*result, error) {
	args := make([]any, 0, len(in.Args))
	for _, arg := range in.Args {
		decoded, err := decode(arg)
		if err != nil {
			return nil, err
		}
		args = append(args, decoded)
	}
	rows, err := conn.QueryContext(ctx, in.SQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := &result{Cols: []column{}, Rows: [][]value{}}
	for _, name := range names {
		out.Cols = append(out.Cols, column{Name: name})
	}
	for rows.Next() {
		cells := make([]any, len(names))
		pointers := make([]any, len(names))
		for index := range cells {
			pointers[index] = &cells[index]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make([]value, 0, len(cells))
		for _, cell := range cells {
			encoded, err := encode(cell)
			if err != nil {
				return nil, err
			}
			row = append(row, encoded)
		}
		out.Rows = append(out.Rows, row)
	}
	return out, rows.Err()
}

func holds(cond *condition, results []*result, errs []*failure) bool {
	if cond == nil {
		return true
	}
	switch cond.Type {
	case "ok":
		return results[*cond.Step] != nil
	case "error":
		return errs[*cond.Step] != nil
	case "not":
		return !holds(cond.Cond, results, errs)
	case "and":
		for _, inner := range cond.Conds {
			if !holds(inner, results, errs) {
				return false
			}
		}
		return true
	case "or":
		for _, inner := range cond.Conds {
			if holds(inner, results, errs) {
				return true
			}
		}
		return false
	}
	return false
}

func (server *Server) pipeline(w http.ResponseWriter, r *http.Request) {
	server.Requests++
	if server.Token != "" && r.Header.Get("Authorization") != "Bearer "+server.Token {
		http.Error(w, `{"message":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Requests []request `json:"requests"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	conn, err := server.DB.Conn(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), "ROLLBACK")
		_ = conn.Close()
	}()
	var results []any
	for _, req := range body.Requests {
		switch req.Type {
		case "execute":
			out, err := run(r.Context(), conn, *req.Stmt)
			if err != nil {
				results = append(results, map[string]any{"type": "error", "error": failure{Message: err.Error()}})
				continue
			}
			results = append(results, map[string]any{"type": "ok", "response": map[string]any{"type": "execute", "result": out}})
		case "batch":
			steps := req.Batch.Steps
			stepResults := make([]*result, len(steps))
			stepErrors := make([]*failure, len(steps))
			for index, current := range steps {
				if !holds(current.Condition, stepResults, stepErrors) {
					continue
				}
				out, err := run(r.Context(), conn, current.Stmt)
				if err != nil {
					stepErrors[index] = &failure{Message: err.Error()}
					continue
				}
				stepResults[index] = out
			}
			results = append(results, map[string]any{"type": "ok", "response": map[string]any{"type": "batch", "result": map[string]any{"step_results": stepResults, "step_errors": stepErrors}}})
		case "close":
			results = append(results, map[string]any{"type": "ok", "response": map[string]any{"type": "close"}})
		default:
			results = append(results, map[string]any{"type": "error", "error": failure{Message: "unsupported request " + req.Type}})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"baton": nil, "base_url": nil, "results": results})
}
