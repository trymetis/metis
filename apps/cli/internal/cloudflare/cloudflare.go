package cloudflare

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"

	cf "github.com/cloudflare/cloudflare-go/v7"
	"github.com/cloudflare/cloudflare-go/v7/d1"
	"github.com/cloudflare/cloudflare-go/v7/dns"
	"github.com/cloudflare/cloudflare-go/v7/email_routing"
	"github.com/cloudflare/cloudflare-go/v7/email_sending"
	"github.com/cloudflare/cloudflare-go/v7/option"
	"github.com/cloudflare/cloudflare-go/v7/r2"
	"github.com/cloudflare/cloudflare-go/v7/workers"
	"github.com/cloudflare/cloudflare-go/v7/zones"

	"github.com/trymetis/metis/apps/cli/internal/gateways"
)

const TokenVariable = "CLOUDFLARE_API_TOKEN"

const TokenPermissions = "Account → Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit; Zone → Email Routing Edit, DNS Edit, Zone Read"

type Client struct {
	api *cf.Client
}

func New(ctx context.Context, token string) (*Client, error) {
	api := cf.NewClient(option.WithAPIToken(token))
	verified, err := api.User.Tokens.Verify(ctx)
	if err != nil {
		return nil, fmt.Errorf("checking the Cloudflare API token: %w", err)
	}
	if verified.Status != "active" {
		return nil, fmt.Errorf("the Cloudflare API token is %s", verified.Status)
	}
	return &Client{api: api}, nil
}

func FromEnv(ctx context.Context) (*Client, bool, error) {
	token := strings.TrimSpace(os.Getenv(TokenVariable))
	if token == "" {
		return nil, false, nil
	}
	client, err := New(ctx, token)
	return client, true, err
}

type Zone struct {
	ID        string
	Name      string
	AccountID string
}

func (client *Client) Zone(ctx context.Context, host string) (Zone, error) {
	host = gateways.NormalizeDomain(host)
	labels := strings.Split(host, ".")
	for index := 0; index < len(labels)-1; index++ {
		name := strings.Join(labels[index:], ".")
		page, err := client.api.Zones.List(ctx, zones.ZoneListParams{Name: cf.F(name)})
		if err != nil {
			return Zone{}, fmt.Errorf("listing Cloudflare zones: %w", err)
		}
		for _, zone := range page.Result {
			if zone.Name == name {
				return Zone{ID: zone.ID, Name: zone.Name, AccountID: zone.Account.ID}, nil
			}
		}
	}
	return Zone{}, fmt.Errorf("no zone for %s is on this Cloudflare account", host)
}

type Record struct {
	Type     string
	Name     string
	Value    string
	Priority int
	TTL      int
}

func (record Record) String() string {
	value := record.Value
	if record.Type == "MX" {
		value = strconv.Itoa(record.Priority) + " " + value
	}
	return fmt.Sprintf("%-5s %s → %s", record.Type, record.Name, value)
}

func fqdn(name, zone string) string {
	name = strings.TrimSuffix(strings.ToLower(name), ".")
	if name == "" || name == "@" {
		return zone
	}
	if name == zone || strings.HasSuffix(name, "."+zone) {
		return name
	}
	return name + "." + zone
}

var caaValue = regexp.MustCompile(`^(\d+)\s+(\S+)\s+"?([^"]*)"?$`)

func (client *Client) EnsureRecord(ctx context.Context, zone Zone, record Record) (bool, error) {
	name := fqdn(record.Name, zone.Name)
	page, err := client.api.DNS.Records.List(ctx, dns.RecordListParams{
		ZoneID: cf.F(zone.ID),
		Name:   cf.F(dns.RecordListParamsName{Exact: cf.F(name)}),
		Type:   cf.F(dns.RecordListParamsType(record.Type)),
	})
	if err != nil {
		return false, fmt.Errorf("listing DNS records for %s: %w", name, err)
	}
	for _, existing := range page.Result {
		if strings.EqualFold(strings.Trim(existing.Content, `"`), strings.Trim(record.Value, `"`)) {
			return false, nil
		}
	}
	ttl := dns.TTL1
	if record.TTL > 1 {
		ttl = dns.TTL(record.TTL)
	}
	body := dns.RecordNewParamsBody{
		Name: cf.F(name),
		TTL:  cf.F(ttl),
		Type: cf.F(dns.RecordNewParamsBodyType(record.Type)),
	}
	switch record.Type {
	case "MX":
		body.Content = cf.F(record.Value)
		body.Priority = cf.F(float64(record.Priority))
	case "CAA":
		match := caaValue.FindStringSubmatch(record.Value)
		if match == nil {
			return false, fmt.Errorf("the CAA value %q is not FLAGS TAG VALUE", record.Value)
		}
		flags, _ := strconv.Atoi(match[1])
		body.Data = cf.F[any](map[string]any{"flags": flags, "tag": match[2], "value": match[3]})
	default:
		body.Content = cf.F(record.Value)
	}
	if _, err := client.api.DNS.Records.New(ctx, dns.RecordNewParams{ZoneID: cf.F(zone.ID), Body: body}); err != nil {
		return false, fmt.Errorf("creating the %s record %s: %w", record.Type, name, err)
	}
	return true, nil
}

func PublicIPv4(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://1.1.1.1/cdn-cgi/trace", nil)
	if err != nil {
		return "", err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8<<10))
	if err != nil {
		return "", err
	}
	for line := range strings.SplitSeq(string(body), "\n") {
		if ip, ok := strings.CutPrefix(line, "ip="); ok && !strings.Contains(ip, ":") {
			return strings.TrimSpace(ip), nil
		}
	}
	return "", errors.New("https://1.1.1.1/cdn-cgi/trace named no IPv4 address")
}

type GatewayParams struct {
	Domain    string
	Addresses []string
	Release   string
	CacheDir  string
	APIToken  string
}

type Gateway struct {
	AccountID string
	ZoneID    string
	D1ID      string
	Endpoint  string
}

func ResourceName(domain string) string {
	return "metis-mail-" + gateways.Slug(domain)
}

var compatibilityDate = regexp.MustCompile(`"compatibility_date"\s*:\s*"([0-9-]+)"`)

func (client *Client) database(ctx context.Context, accountID, name string) (string, error) {
	page, err := client.api.D1.Database.List(ctx, d1.DatabaseListParams{AccountID: cf.F(accountID), Name: cf.F(name)})
	if err != nil {
		return "", fmt.Errorf("listing D1 databases: %w", err)
	}
	for _, database := range page.Result {
		if database.Name == name {
			return database.UUID, nil
		}
	}
	created, err := client.api.D1.Database.New(ctx, d1.DatabaseNewParams{AccountID: cf.F(accountID), Name: cf.F(name)})
	if err != nil {
		return "", fmt.Errorf("creating the D1 database %s: %w", name, err)
	}
	return created.UUID, nil
}

func isNotFound(err error) bool {
	var apiErr *cf.Error
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound
}

func (client *Client) bucket(ctx context.Context, accountID, name string) error {
	_, err := client.api.R2.Buckets.Get(ctx, name, r2.BucketGetParams{AccountID: cf.F(accountID)})
	if err == nil {
		return nil
	}
	if !isNotFound(err) {
		return fmt.Errorf("reading the R2 bucket %s: %w", name, err)
	}
	if _, err := client.api.R2.Buckets.New(ctx, r2.BucketNewParams{AccountID: cf.F(accountID), Name: cf.F(name)}); err != nil {
		return fmt.Errorf("creating the R2 bucket %s: %w", name, err)
	}
	return nil
}

func (client *Client) DeployGateway(ctx context.Context, params GatewayParams, progress func(string)) (Gateway, error) {
	domain := gateways.NormalizeDomain(params.Domain)
	name := ResourceName(domain)
	zone, err := client.Zone(ctx, domain)
	if err != nil {
		return Gateway{}, err
	}
	if zone.Name != domain {
		return Gateway{}, fmt.Errorf("Email Routing works on a zone apex; %s is inside the zone %s", domain, zone.Name)
	}
	account := zone.AccountID

	archive, err := gateways.Artifact(ctx, gateways.Cloudflare, params.Release, "gateway-cloudflare.zip", params.CacheDir)
	if err != nil {
		return Gateway{}, err
	}
	module, err := gateways.ZipFile(archive, "index.js")
	if err != nil {
		return Gateway{}, err
	}
	sourceMap, err := gateways.ZipFile(archive, "index.js.map")
	if err != nil {
		return Gateway{}, err
	}
	wrangler, err := gateways.SourceFile(ctx, gateways.Cloudflare, params.Release, "apps/gateway-cloudflare/wrangler.jsonc")
	if err != nil {
		return Gateway{}, err
	}
	date := compatibilityDate.FindSubmatch(wrangler)
	if date == nil {
		return Gateway{}, errors.New("the release's wrangler.jsonc names no compatibility_date")
	}
	schema, err := gateways.SourceFile(ctx, gateways.Cloudflare, params.Release, "apps/gateway-cloudflare/schema.sql")
	if err != nil {
		return Gateway{}, err
	}
	progress("Downloaded the gateway for " + params.Release)

	databaseID, err := client.database(ctx, account, name)
	if err != nil {
		return Gateway{}, err
	}
	if _, err := client.api.D1.Database.Query(ctx, databaseID, d1.DatabaseQueryParams{
		AccountID: cf.F(account),
		Body:      d1.DatabaseQueryParamsBodyD1SingleQuery{Sql: cf.F(string(schema))},
	}); err != nil {
		return Gateway{}, fmt.Errorf("applying the schema to D1 %s: %w", name, err)
	}
	progress("D1 database " + name)
	if err := client.bucket(ctx, account, name+"-raw"); err != nil {
		return Gateway{}, err
	}
	progress("R2 bucket " + name + "-raw")

	bindings := []workers.ScriptUpdateParamsMetadataBindingUnion{
		workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindD1{
			Name: cf.F("DB"), DatabaseID: cf.F(databaseID),
			Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindD1TypeD1),
		},
		workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindR2Bucket{
			Name: cf.F("RAW"), BucketName: cf.F(name + "-raw"),
			Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindR2BucketTypeR2Bucket),
		},
		workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindSendEmail{
			Name: cf.F("EMAIL"),
			Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindSendEmailTypeSendEmail),
		},
		workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindPlainText{
			Name: cf.F("MAIL_DOMAIN"), Text: cf.F(domain),
			Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindPlainTextTypePlainText),
		},
		workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindSecretText{
			Name: cf.F("API_TOKEN"), Text: cf.F(params.APIToken),
			Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindSecretTextTypeSecretText),
		},
	}
	if _, err := client.api.Workers.Scripts.Update(ctx, name, workers.ScriptUpdateParams{
		AccountID: cf.F(account),
		Metadata: cf.F(workers.ScriptUpdateParamsMetadata{
			MainModule:        cf.F("index.js"),
			CompatibilityDate: cf.F(string(date[1])),
			Bindings:          cf.F(bindings),
			Observability:     cf.F(workers.ScriptUpdateParamsMetadataObservability{Enabled: cf.F(true)}),
		}),
		Files: cf.F([]io.Reader{
			cf.FileParam(bytes.NewReader(module), "index.js", "application/javascript+module").Value,
			cf.FileParam(bytes.NewReader(sourceMap), "index.js.map", "application/source-map").Value,
		}),
	}); err != nil {
		return Gateway{}, fmt.Errorf("uploading the Worker %s: %w", name, err)
	}
	if _, err := client.api.Workers.Scripts.Subdomain.New(ctx, name, workers.ScriptSubdomainNewParams{
		AccountID: cf.F(account), Enabled: cf.F(true),
	}); err != nil {
		return Gateway{}, fmt.Errorf("turning on workers.dev for %s: %w", name, err)
	}
	subdomain, err := client.api.Workers.Subdomains.Get(ctx, workers.SubdomainGetParams{AccountID: cf.F(account)})
	if err != nil {
		return Gateway{}, fmt.Errorf("reading the account's workers.dev subdomain: %w", err)
	}
	endpoint := fmt.Sprintf("https://%s.%s.workers.dev", name, subdomain.Subdomain)
	progress("Worker " + endpoint)

	if err := client.routeMail(ctx, zone.ID, name, params.Addresses); err != nil {
		return Gateway{}, err
	}
	progress("Email Routing to the Worker")
	if err := client.emailSending(ctx, zone, domain, progress); err != nil {
		return Gateway{}, err
	}
	return Gateway{AccountID: account, ZoneID: zone.ID, D1ID: databaseID, Endpoint: endpoint}, nil
}

func (client *Client) routeMail(ctx context.Context, zoneID, worker string, addresses []string) error {
	if _, err := client.api.EmailRouting.DNS.New(ctx, email_routing.DNSNewParams{ZoneID: cf.F(zoneID)}); err != nil &&
		!strings.Contains(strings.ToLower(err.Error()), "already") {
		return fmt.Errorf("turning on Email Routing: %w", err)
	}
	if len(addresses) == 0 {
		_, err := client.api.EmailRouting.Rules.CatchAlls.Update(ctx, email_routing.RuleCatchAllUpdateParams{
			ZoneID:   cf.F(zoneID),
			Enabled:  cf.F(email_routing.RuleCatchAllUpdateParamsEnabledTrue),
			Name:     cf.F("Metis " + worker),
			Matchers: cf.F([]email_routing.CatchAllMatcherParam{{Type: cf.F(email_routing.CatchAllMatcherTypeAll)}}),
			Actions:  cf.F([]email_routing.CatchAllActionParam{{Type: cf.F(email_routing.CatchAllActionTypeWorker), Value: cf.F([]string{worker})}}),
		})
		if err != nil {
			return fmt.Errorf("routing the catch-all to %s: %w", worker, err)
		}
		return nil
	}
	existing := map[string]bool{}
	rules, err := client.api.EmailRouting.Rules.List(ctx, email_routing.RuleListParams{ZoneID: cf.F(zoneID), PerPage: cf.F(50.0)})
	if err != nil {
		return fmt.Errorf("listing Email Routing rules: %w", err)
	}
	for _, rule := range rules.Result {
		for _, matcher := range rule.Matchers {
			if matcher.Type == email_routing.MatcherTypeLiteral {
				existing[strings.ToLower(matcher.Value)] = true
			}
		}
	}
	for _, address := range addresses {
		address = strings.ToLower(address)
		if existing[address] {
			continue
		}
		if _, err := client.api.EmailRouting.Rules.New(ctx, email_routing.RuleNewParams{
			ZoneID:   cf.F(zoneID),
			Name:     cf.F("Metis " + address),
			Enabled:  cf.F(email_routing.RuleNewParamsEnabledTrue),
			Matchers: cf.F([]email_routing.MatcherParam{{Type: cf.F(email_routing.MatcherTypeLiteral), Field: cf.F(email_routing.MatcherFieldTo), Value: cf.F(address)}}),
			Actions:  cf.F([]email_routing.ActionParam{{Type: cf.F(email_routing.ActionTypeWorker), Value: cf.F([]string{worker})}}),
		}); err != nil {
			return fmt.Errorf("routing %s to %s: %w", address, worker, err)
		}
	}
	return client.disableCatchAll(ctx, zoneID, "")
}

func (client *Client) disableCatchAll(ctx context.Context, zoneID, onlyWorker string) error {
	if onlyWorker != "" {
		current, err := client.api.EmailRouting.Rules.CatchAlls.Get(ctx, email_routing.RuleCatchAllGetParams{ZoneID: cf.F(zoneID)})
		if err != nil {
			return fmt.Errorf("reading the catch-all rule: %w", err)
		}
		points := false
		for _, action := range current.Actions {
			if action.Type == email_routing.CatchAllActionTypeWorker && slices.Contains(action.Value, onlyWorker) {
				points = true
			}
		}
		if !points {
			return nil
		}
	}
	_, err := client.api.EmailRouting.Rules.CatchAlls.Update(ctx, email_routing.RuleCatchAllUpdateParams{
		ZoneID:   cf.F(zoneID),
		Enabled:  cf.F(email_routing.RuleCatchAllUpdateParamsEnabledFalse),
		Matchers: cf.F([]email_routing.CatchAllMatcherParam{{Type: cf.F(email_routing.CatchAllMatcherTypeAll)}}),
		Actions:  cf.F([]email_routing.CatchAllActionParam{{Type: cf.F(email_routing.CatchAllActionTypeDrop)}}),
	})
	if err != nil {
		return fmt.Errorf("turning off the catch-all rule: %w", err)
	}
	return nil
}

func (client *Client) emailSending(ctx context.Context, zone Zone, domain string, progress func(string)) error {
	tag := ""
	list, err := client.api.EmailSending.Subdomains.List(ctx, email_sending.SubdomainListParams{ZoneID: cf.F(zone.ID)})
	if err != nil {
		return fmt.Errorf("listing Email Sending domains: %w", err)
	}
	for _, subdomain := range list.Result {
		if subdomain.Name == domain {
			tag = subdomain.Tag
		}
	}
	if tag == "" {
		created, err := client.api.EmailSending.Subdomains.New(ctx, email_sending.SubdomainNewParams{ZoneID: cf.F(zone.ID), Name: cf.F(domain)})
		if err != nil {
			return fmt.Errorf("turning on Email Sending for %s: %w", domain, err)
		}
		tag = created.Tag
	}
	records, err := client.api.EmailSending.Subdomains.DNS.Get(ctx, tag, email_sending.SubdomainDNSGetParams{ZoneID: cf.F(zone.ID)})
	if err != nil {
		return fmt.Errorf("reading the Email Sending DNS records: %w", err)
	}
	for _, record := range records.Result {
		created, err := client.EnsureRecord(ctx, zone, Record{
			Type: string(record.Type), Name: record.Name, Value: record.Content, Priority: int(record.Priority), TTL: int(record.TTL),
		})
		if err != nil {
			return err
		}
		if created {
			progress(fmt.Sprintf("DNS %s %s", record.Type, record.Name))
		}
	}
	progress("Email Sending for " + domain)
	return nil
}

func (client *Client) RemoveGateway(ctx context.Context, domain string, purge bool, progress func(string)) error {
	domain = gateways.NormalizeDomain(domain)
	name := ResourceName(domain)
	zone, err := client.Zone(ctx, domain)
	if err != nil {
		return err
	}
	rules, err := client.api.EmailRouting.Rules.List(ctx, email_routing.RuleListParams{ZoneID: cf.F(zone.ID), PerPage: cf.F(50.0)})
	if err != nil {
		return fmt.Errorf("listing Email Routing rules: %w", err)
	}
	for _, rule := range rules.Result {
		for _, action := range rule.Actions {
			if action.Type == email_routing.ActionTypeWorker && slices.Contains(action.Value, name) {
				if _, err := client.api.EmailRouting.Rules.Delete(ctx, rule.ID, email_routing.RuleDeleteParams{ZoneID: cf.F(zone.ID)}); err != nil {
					return fmt.Errorf("deleting the routing rule %s: %w", rule.Name, err)
				}
				progress("Deleted the routing rule " + rule.Name)
				break
			}
		}
	}
	if err := client.disableCatchAll(ctx, zone.ID, name); err != nil {
		return err
	}
	if _, err := client.api.Workers.Scripts.Delete(ctx, name, workers.ScriptDeleteParams{AccountID: cf.F(zone.AccountID)}); err != nil && !isNotFound(err) {
		return fmt.Errorf("deleting the Worker %s: %w", name, err)
	}
	progress("Deleted the Worker " + name)
	if !purge {
		return nil
	}
	page, err := client.api.D1.Database.List(ctx, d1.DatabaseListParams{AccountID: cf.F(zone.AccountID), Name: cf.F(name)})
	if err != nil {
		return fmt.Errorf("listing D1 databases: %w", err)
	}
	for _, database := range page.Result {
		if database.Name == name {
			if _, err := client.api.D1.Database.Delete(ctx, database.UUID, d1.DatabaseDeleteParams{AccountID: cf.F(zone.AccountID)}); err != nil {
				return fmt.Errorf("deleting the D1 database %s: %w", name, err)
			}
			progress("Deleted the D1 database " + name)
		}
	}
	if _, err := client.api.R2.Buckets.Delete(ctx, name+"-raw", r2.BucketDeleteParams{AccountID: cf.F(zone.AccountID)}); err != nil && !isNotFound(err) {
		return fmt.Errorf("deleting the R2 bucket %s-raw (empty it in the Cloudflare dashboard first): %w", name, err)
	}
	progress("Deleted the R2 bucket " + name + "-raw")
	return nil
}
