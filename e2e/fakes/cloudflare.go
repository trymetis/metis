package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"maps"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
)

const (
	cloudflarePrefix    = "/client/v4/"
	cloudflareAccount   = "e2eaccount0000000000000000000000"
	cloudflareSubdomain = "metis-e2e"
)

type cfZone struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type cfRecord struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`
	Name     string  `json:"name"`
	Content  string  `json:"content"`
	Priority float64 `json:"priority,omitempty"`
	TTL      float64 `json:"ttl"`
	Data     any     `json:"data,omitempty"`
}

type cfRule struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	Enabled  bool             `json:"enabled"`
	Matchers []map[string]any `json:"matchers"`
	Actions  []map[string]any `json:"actions"`
}

type cfSending struct {
	Tag  string `json:"tag"`
	Name string `json:"name"`
}

type cloudflareFake struct {
	calls callLog

	mu        sync.Mutex
	zones     []cfZone
	records   map[string][]cfRecord
	databases map[string]string
	buckets   map[string]bool
	scripts   map[string]map[string]any
	rules     map[string][]cfRule
	catchAll  map[string]map[string]any
	sending   map[string][]cfSending
}

func cfWrite(w http.ResponseWriter, status int, result any, extra map[string]any) {
	body := map[string]any{"success": status < 300, "errors": []any{}, "messages": []any{}, "result": result}
	maps.Copy(body, extra)
	writeJSON(w, status, body)
}

func cfFail(w http.ResponseWriter, status, code int, message string) {
	writeJSON(w, status, map[string]any{
		"success":  false,
		"errors":   []map[string]any{{"code": code, "message": message}},
		"messages": []any{},
		"result":   nil,
	})
}

func cfList(w http.ResponseWriter, items any, count int) {
	cfWrite(w, http.StatusOK, items, map[string]any{"result_info": map[string]any{
		"page": 1, "per_page": max(count, 20), "count": count, "total_count": count, "total_pages": 1,
	}})
}

func readJSON(r *http.Request) map[string]any {
	body := map[string]any{}
	raw, _ := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	_ = json.Unmarshal(raw, &body)
	return body
}

func text(body map[string]any, key string) string {
	value, _ := body[key].(string)
	return value
}

func (f *cloudflareFake) zone(id string) (cfZone, bool) {
	for _, zone := range f.zones {
		if zone.ID == id {
			return zone, true
		}
	}
	return cfZone{}, false
}

func zoneBody(zone cfZone) map[string]any {
	return map[string]any{
		"id": zone.ID, "name": zone.Name, "status": "active",
		"account": map[string]string{"id": cloudflareAccount, "name": "Metis e2e"},
	}
}

func (f *cloudflareFake) handle(w http.ResponseWriter, r *http.Request) {
	path, ok := strings.CutPrefix(r.URL.Path, cloudflarePrefix)
	if !ok {
		cfFail(w, http.StatusNotFound, 7000, "No route for that URI")
		return
	}
	if !strings.HasPrefix(r.Header.Get("authorization"), "Bearer ") || len(r.Header.Get("authorization")) <= len("Bearer ") {
		cfFail(w, http.StatusBadRequest, 9106, "Missing X-Auth-Key, X-Auth-Email or Authorization headers")
		return
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case r.Method == http.MethodGet && path == "user/tokens/verify":
		cfWrite(w, http.StatusOK, map[string]string{"id": "e2etoken", "status": "active"}, nil)
	case r.Method == http.MethodGet && path == "zones":
		name := r.URL.Query().Get("name")
		matches := []map[string]any{}
		for _, zone := range f.zones {
			if name == "" || zone.Name == name {
				matches = append(matches, zoneBody(zone))
			}
		}
		cfList(w, matches, len(matches))
	case len(parts) >= 3 && parts[0] == "zones":
		zone, found := f.zone(parts[1])
		if !found {
			cfFail(w, http.StatusNotFound, 1001, "Invalid zone identifier")
			return
		}
		f.zoneRoute(w, r, zone, parts[2:])
	case len(parts) >= 3 && parts[0] == "accounts":
		if parts[1] != cloudflareAccount {
			cfFail(w, http.StatusForbidden, 9109, "Unauthorized to access requested resource")
			return
		}
		f.accountRoute(w, r, parts[2:])
	default:
		cfFail(w, http.StatusNotFound, 7000, "No route for that URI")
	}
}

func (f *cloudflareFake) zoneRoute(w http.ResponseWriter, r *http.Request, zone cfZone, rest []string) {
	route := strings.Join(rest, "/")
	switch {
	case route == "dns_records" && r.Method == http.MethodGet:
		name := r.URL.Query().Get("name.exact")
		kind := r.URL.Query().Get("type")
		matches := []cfRecord{}
		for _, record := range f.records[zone.ID] {
			if (name == "" || record.Name == name) && (kind == "" || record.Type == kind) {
				matches = append(matches, record)
			}
		}
		cfList(w, matches, len(matches))
	case route == "dns_records" && r.Method == http.MethodPost:
		body := readJSON(r)
		record := cfRecord{ID: newID(), Type: text(body, "type"), Name: text(body, "name"), Content: text(body, "content"), Data: body["data"]}
		record.Priority, _ = body["priority"].(float64)
		record.TTL, _ = body["ttl"].(float64)
		f.records[zone.ID] = append(f.records[zone.ID], record)
		f.calls.add("dns", "create", record.Name, map[string]string{"type": record.Type, "content": record.Content, "zone": zone.Name})
		cfWrite(w, http.StatusOK, record, nil)
	case route == "email/routing/dns" && r.Method == http.MethodPost:
		f.calls.add("email-routing", "enable", zone.Name, nil)
		cfWrite(w, http.StatusOK, map[string]any{"id": zone.ID, "name": zone.Name, "enabled": true, "status": "ready"}, nil)
	case route == "email/routing/rules" && r.Method == http.MethodGet:
		rules := f.rules[zone.ID]
		if rules == nil {
			rules = []cfRule{}
		}
		cfList(w, rules, len(rules))
	case route == "email/routing/rules" && r.Method == http.MethodPost:
		body := readJSON(r)
		rule := cfRule{ID: newID(), Name: text(body, "name"), Enabled: body["enabled"] == true,
			Matchers: anyMaps(body["matchers"]), Actions: anyMaps(body["actions"])}
		f.rules[zone.ID] = append(f.rules[zone.ID], rule)
		f.calls.add("email-routing", "create-rule", rule.Name, map[string]string{"zone": zone.Name, "workers": workersOf(rule.Actions)})
		cfWrite(w, http.StatusOK, rule, nil)
	case route == "email/routing/rules/catch_all" && r.Method == http.MethodGet:
		current := f.catchAll[zone.ID]
		if current == nil {
			current = map[string]any{"id": "catch-all", "name": "", "enabled": false,
				"matchers": []map[string]any{{"type": "all"}}, "actions": []map[string]any{{"type": "drop"}}}
		}
		cfWrite(w, http.StatusOK, current, nil)
	case route == "email/routing/rules/catch_all" && r.Method == http.MethodPut:
		body := readJSON(r)
		body["id"] = "catch-all"
		f.catchAll[zone.ID] = body
		f.calls.add("email-routing", "catch-all", zone.Name, map[string]string{
			"enabled": fmt.Sprint(body["enabled"]), "workers": workersOf(anyMaps(body["actions"])),
		})
		cfWrite(w, http.StatusOK, body, nil)
	case len(rest) == 4 && route == "email/routing/rules/"+rest[3] && r.Method == http.MethodDelete:
		rules := f.rules[zone.ID]
		index := slices.IndexFunc(rules, func(rule cfRule) bool { return rule.ID == rest[3] })
		if index < 0 {
			cfFail(w, http.StatusNotFound, 2020, "Rule not found")
			return
		}
		f.calls.add("email-routing", "delete-rule", rules[index].Name, map[string]string{"zone": zone.Name})
		cfWrite(w, http.StatusOK, rules[index], nil)
		f.rules[zone.ID] = slices.Delete(rules, index, index+1)
	case route == "email/sending/subdomains" && r.Method == http.MethodGet:
		list := f.sending[zone.ID]
		if list == nil {
			list = []cfSending{}
		}
		cfWrite(w, http.StatusOK, list, nil)
	case route == "email/sending/subdomains" && r.Method == http.MethodPost:
		body := readJSON(r)
		created := cfSending{Tag: newID(), Name: text(body, "name")}
		f.sending[zone.ID] = append(f.sending[zone.ID], created)
		f.calls.add("email-sending", "enable", created.Name, nil)
		cfWrite(w, http.StatusOK, created, nil)
	case len(rest) == 5 && rest[0] == "email" && rest[2] == "subdomains" && rest[4] == "dns" && r.Method == http.MethodGet:
		name := ""
		for _, subdomain := range f.sending[zone.ID] {
			if subdomain.Tag == rest[3] {
				name = subdomain.Name
			}
		}
		if name == "" {
			cfFail(w, http.StatusNotFound, 2021, "Subdomain not found")
			return
		}
		cfWrite(w, http.StatusOK, []map[string]any{
			{"type": "TXT", "name": "cf-bounce." + name, "content": "v=spf1 include:_spf.mx.cloudflare.net ~all", "ttl": 1},
			{"type": "MX", "name": "cf-bounce." + name, "content": "route1.mx.cloudflare.net", "priority": 10, "ttl": 1},
		}, nil)
	default:
		cfFail(w, http.StatusNotFound, 7000, "No route for that URI")
	}
}

func (f *cloudflareFake) accountRoute(w http.ResponseWriter, r *http.Request, rest []string) {
	route := strings.Join(rest, "/")
	switch {
	case route == "d1/database" && r.Method == http.MethodGet:
		name := r.URL.Query().Get("name")
		list := []map[string]string{}
		for databaseName, id := range f.databases {
			if name == "" || databaseName == name {
				list = append(list, map[string]string{"uuid": id, "name": databaseName})
			}
		}
		cfList(w, list, len(list))
	case route == "d1/database" && r.Method == http.MethodPost:
		name := text(readJSON(r), "name")
		id := newID()
		f.databases[name] = id
		f.calls.add("d1", "create", name, nil)
		cfWrite(w, http.StatusOK, map[string]string{"uuid": id, "name": name}, nil)
	case len(rest) == 4 && rest[0] == "d1" && rest[3] == "query" && r.Method == http.MethodPost:
		if !f.hasDatabase(rest[2]) {
			cfFail(w, http.StatusNotFound, 7404, "The database could not be found")
			return
		}
		sql := text(readJSON(r), "sql")
		f.calls.add("d1", "query", f.databaseName(rest[2]), map[string]string{"bytes": fmt.Sprint(len(sql))})
		cfWrite(w, http.StatusOK, []map[string]any{{"success": true, "results": []any{}, "meta": map[string]any{}}}, nil)
	case len(rest) == 3 && rest[0] == "d1" && r.Method == http.MethodDelete:
		name := f.databaseName(rest[2])
		if name == "" {
			cfFail(w, http.StatusNotFound, 7404, "The database could not be found")
			return
		}
		delete(f.databases, name)
		f.calls.add("d1", "delete", name, nil)
		cfWrite(w, http.StatusOK, nil, nil)
	case len(rest) == 3 && rest[0] == "r2" && rest[1] == "buckets" && r.Method == http.MethodGet:
		if !f.buckets[rest[2]] {
			cfFail(w, http.StatusNotFound, 10006, "The specified bucket does not exist.")
			return
		}
		cfWrite(w, http.StatusOK, map[string]string{"name": rest[2]}, nil)
	case route == "r2/buckets" && r.Method == http.MethodPost:
		name := text(readJSON(r), "name")
		f.buckets[name] = true
		f.calls.add("r2", "create", name, nil)
		cfWrite(w, http.StatusOK, map[string]string{"name": name}, nil)
	case len(rest) == 3 && rest[0] == "r2" && rest[1] == "buckets" && r.Method == http.MethodDelete:
		if !f.buckets[rest[2]] {
			cfFail(w, http.StatusNotFound, 10006, "The specified bucket does not exist.")
			return
		}
		delete(f.buckets, rest[2])
		f.calls.add("r2", "delete", rest[2], nil)
		cfWrite(w, http.StatusOK, nil, nil)
	case len(rest) == 3 && rest[0] == "workers" && rest[1] == "scripts" && r.Method == http.MethodPut:
		metadata, files, err := scriptUpload(r)
		if err != nil {
			cfFail(w, http.StatusBadRequest, 10021, err.Error())
			return
		}
		f.scripts[rest[2]] = metadata
		f.calls.add("workers", "upload", rest[2], map[string]string{
			"main_module": fmt.Sprint(metadata["main_module"]), "files": strings.Join(files, ","),
			"bindings": bindingNames(metadata["bindings"]),
		})
		cfWrite(w, http.StatusOK, map[string]any{"id": rest[2]}, nil)
	case len(rest) == 3 && rest[0] == "workers" && rest[1] == "scripts" && r.Method == http.MethodDelete:
		if _, found := f.scripts[rest[2]]; !found {
			cfFail(w, http.StatusNotFound, 10007, "This Worker does not exist on your account.")
			return
		}
		delete(f.scripts, rest[2])
		f.calls.add("workers", "delete", rest[2], nil)
		cfWrite(w, http.StatusOK, nil, nil)
	case len(rest) == 4 && rest[0] == "workers" && rest[1] == "scripts" && rest[3] == "subdomain" && r.Method == http.MethodPost:
		if _, found := f.scripts[rest[2]]; !found {
			cfFail(w, http.StatusNotFound, 10007, "This Worker does not exist on your account.")
			return
		}
		f.calls.add("workers", "subdomain", rest[2], nil)
		cfWrite(w, http.StatusOK, map[string]bool{"enabled": true, "previews_enabled": false}, nil)
	case route == "workers/subdomain" && r.Method == http.MethodGet:
		cfWrite(w, http.StatusOK, map[string]string{"subdomain": cloudflareSubdomain}, nil)
	default:
		cfFail(w, http.StatusNotFound, 7000, "No route for that URI")
	}
}

func (f *cloudflareFake) hasDatabase(id string) bool {
	return f.databaseName(id) != ""
}

func (f *cloudflareFake) databaseName(id string) string {
	for name, databaseID := range f.databases {
		if databaseID == id {
			return name
		}
	}
	return ""
}

func anyMaps(value any) []map[string]any {
	list, _ := value.([]any)
	out := []map[string]any{}
	for _, item := range list {
		if entry, ok := item.(map[string]any); ok {
			out = append(out, entry)
		}
	}
	return out
}

func workersOf(actions []map[string]any) string {
	var names []string
	for _, action := range actions {
		if action["type"] != "worker" {
			continue
		}
		values, _ := action["value"].([]any)
		for _, value := range values {
			names = append(names, fmt.Sprint(value))
		}
	}
	return strings.Join(names, ",")
}

func bindingNames(value any) string {
	var names []string
	for _, binding := range anyMaps(value) {
		names = append(names, fmt.Sprint(binding["name"]))
	}
	return strings.Join(names, ",")
}

var bindingField = regexp.MustCompile(`^metadata\.bindings\.(\d+)\.name$`)

func scriptUpload(r *http.Request) (map[string]any, []string, error) {
	_, params, err := mime.ParseMediaType(r.Header.Get("content-type"))
	if err != nil || params["boundary"] == "" {
		return nil, nil, fmt.Errorf("the upload is not multipart: %v", err)
	}
	reader := multipart.NewReader(r.Body, params["boundary"])
	metadata := map[string]any{}
	bindings := map[int]string{}
	var files []string
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, err
		}
		raw, err := io.ReadAll(io.LimitReader(part, 64<<20))
		if err != nil {
			return nil, nil, err
		}
		field := part.FormName()
		switch {
		case part.FileName() != "":
			if len(raw) == 0 {
				return nil, nil, fmt.Errorf("the file %s is empty", part.FileName())
			}
			files = append(files, part.FileName())
		case field == "metadata":
			if err := json.Unmarshal(raw, &metadata); err != nil {
				return nil, nil, fmt.Errorf("metadata is not JSON: %w", err)
			}
		case bindingField.MatchString(field):
			index, _ := strconv.Atoi(bindingField.FindStringSubmatch(field)[1])
			bindings[index] = string(raw)
		case strings.HasPrefix(field, "metadata.") && strings.Count(field, ".") == 1:
			metadata[strings.TrimPrefix(field, "metadata.")] = string(raw)
		}
	}
	if len(bindings) > 0 {
		list := make([]any, len(bindings))
		for index, name := range bindings {
			if index < len(list) {
				list[index] = map[string]any{"name": name}
			}
		}
		metadata["bindings"] = list
	}
	if metadata["main_module"] == nil || !slices.Contains(files, fmt.Sprint(metadata["main_module"])) {
		return nil, nil, fmt.Errorf("the main module %v is not among the uploaded files %v", metadata["main_module"], files)
	}
	return metadata, files, nil
}

func newCloudflare() (*standIn, error) {
	fake := &cloudflareFake{
		records:   map[string][]cfRecord{},
		databases: map[string]string{},
		buckets:   map[string]bool{},
		scripts:   map[string]map[string]any{},
		rules:     map[string][]cfRule{},
		catchAll:  map[string]map[string]any{},
		sending:   map[string][]cfSending{},
	}
	for name := range strings.SplitSeq(os.Getenv("CLOUDFLARE_ZONES"), ",") {
		if name = strings.TrimSpace(strings.ToLower(name)); name != "" {
			fake.zones = append(fake.zones, cfZone{ID: fmt.Sprintf("%032x", len(fake.zones)+1), Name: name})
		}
	}
	if len(fake.zones) == 0 {
		return nil, fmt.Errorf("CLOUDFLARE_ZONES names no zone")
	}
	control := http.NewServeMux()
	fake.calls.routes(control)
	log.Printf("[cloudflare] api.cloudflare.com for %d zone(s)", len(fake.zones))
	return &standIn{
		name:    "cloudflare",
		hosts:   []string{"api.cloudflare.com"},
		api:     http.HandlerFunc(fake.handle),
		control: control,
		routes:  "GET, DELETE /cloudflare/calls",
	}, nil
}
