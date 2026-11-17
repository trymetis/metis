package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	cf "github.com/cloudflare/cloudflare-go/v7"
	"github.com/cloudflare/cloudflare-go/v7/d1"
	"github.com/cloudflare/cloudflare-go/v7/dns"
	"github.com/cloudflare/cloudflare-go/v7/email_routing"
	"github.com/cloudflare/cloudflare-go/v7/email_sending"
	"github.com/cloudflare/cloudflare-go/v7/option"
	"github.com/cloudflare/cloudflare-go/v7/r2"
	"github.com/cloudflare/cloudflare-go/v7/workers"
	"github.com/cloudflare/cloudflare-go/v7/zones"
)

func newCloudflareFake(zoneNames ...string) *cloudflareFake {
	fake := &cloudflareFake{
		records: map[string][]cfRecord{}, databases: map[string]string{}, buckets: map[string]bool{},
		scripts: map[string]map[string]any{}, rules: map[string][]cfRule{},
		catchAll: map[string]map[string]any{}, sending: map[string][]cfSending{},
	}
	for index, name := range zoneNames {
		fake.zones = append(fake.zones, cfZone{ID: string(rune('a'+index)) + "zone", Name: name})
	}
	return fake
}

func TestTheCloudflareFakeAnswersTheGatewayDeployAndRemoveTheCLIRuns(t *testing.T) {
	fake := newCloudflareFake("cf.demo.trymetis.email", "demo.trymetis.email")
	server := httptest.NewTLSServer(http.HandlerFunc(fake.handle))
	defer server.Close()
	api := cf.NewClient(
		option.WithAPIToken("e2e-cloudflare-token"),
		option.WithBaseURL(server.URL+cloudflarePrefix),
		option.WithHTTPClient(server.Client()),
		option.WithMaxRetries(0),
	)
	ctx := context.Background()
	const domain = "cf.demo.trymetis.email"
	const name = "metis-mail-cf-demo-trymetis-email"

	verified, err := api.User.Tokens.Verify(ctx)
	if err != nil || verified.Status != "active" {
		t.Fatalf("Verify: %+v %v", verified, err)
	}
	page, err := api.Zones.List(ctx, zones.ZoneListParams{Name: cf.F(domain)})
	if err != nil || len(page.Result) != 1 || page.Result[0].Account.ID != cloudflareAccount {
		t.Fatalf("Zones.List: %+v %v", page, err)
	}
	zone := page.Result[0]
	account := cf.F(cloudflareAccount)

	databases, err := api.D1.Database.List(ctx, d1.DatabaseListParams{AccountID: account, Name: cf.F(name)})
	if err != nil || len(databases.Result) != 0 {
		t.Fatalf("D1 list: %v", err)
	}
	database, err := api.D1.Database.New(ctx, d1.DatabaseNewParams{AccountID: account, Name: cf.F(name)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := api.D1.Database.Query(ctx, database.UUID, d1.DatabaseQueryParams{
		AccountID: account, Body: d1.DatabaseQueryParamsBodyD1SingleQuery{Sql: cf.F("CREATE TABLE t (id TEXT)")},
	}); err != nil {
		t.Fatal(err)
	}
	_, err = api.R2.Buckets.Get(ctx, name+"-raw", r2.BucketGetParams{AccountID: account})
	var apiErr *cf.Error
	if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusNotFound {
		t.Fatalf("R2 get before create: %v", err)
	}
	if _, err := api.R2.Buckets.New(ctx, r2.BucketNewParams{AccountID: account, Name: cf.F(name + "-raw")}); err != nil {
		t.Fatal(err)
	}
	if _, err := api.Workers.Scripts.Update(ctx, name, workers.ScriptUpdateParams{
		AccountID: account,
		Metadata: cf.F(workers.ScriptUpdateParamsMetadata{
			MainModule: cf.F("index.js"),
			Bindings: cf.F([]workers.ScriptUpdateParamsMetadataBindingUnion{
				workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindD1{
					Name: cf.F("DB"), DatabaseID: cf.F(database.UUID),
					Type: cf.F(workers.ScriptUpdateParamsMetadataBindingsWorkersBindingKindD1TypeD1),
				},
			}),
		}),
		Files: cf.F([]io.Reader{
			cf.FileParam(bytes.NewReader([]byte("export default {}")), "index.js", "application/javascript+module").Value,
			cf.FileParam(bytes.NewReader([]byte("{}")), "index.js.map", "application/source-map").Value,
		}),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := api.Workers.Scripts.Subdomain.New(ctx, name, workers.ScriptSubdomainNewParams{AccountID: account, Enabled: cf.F(true)}); err != nil {
		t.Fatal(err)
	}
	subdomain, err := api.Workers.Subdomains.Get(ctx, workers.SubdomainGetParams{AccountID: account})
	if err != nil || subdomain.Subdomain != cloudflareSubdomain {
		t.Fatalf("Subdomains.Get: %+v %v", subdomain, err)
	}
	if _, err := api.EmailRouting.DNS.New(ctx, email_routing.DNSNewParams{ZoneID: cf.F(zone.ID)}); err != nil {
		t.Fatal(err)
	}
	if _, err := api.EmailRouting.Rules.CatchAlls.Update(ctx, email_routing.RuleCatchAllUpdateParams{
		ZoneID: cf.F(zone.ID), Enabled: cf.F(email_routing.RuleCatchAllUpdateParamsEnabledTrue),
		Matchers: cf.F([]email_routing.CatchAllMatcherParam{{Type: cf.F(email_routing.CatchAllMatcherTypeAll)}}),
		Actions:  cf.F([]email_routing.CatchAllActionParam{{Type: cf.F(email_routing.CatchAllActionTypeWorker), Value: cf.F([]string{name})}}),
	}); err != nil {
		t.Fatal(err)
	}
	listed, err := api.EmailSending.Subdomains.List(ctx, email_sending.SubdomainListParams{ZoneID: cf.F(zone.ID)})
	if err != nil || len(listed.Result) != 0 {
		t.Fatalf("EmailSending list: %v", err)
	}
	sending, err := api.EmailSending.Subdomains.New(ctx, email_sending.SubdomainNewParams{ZoneID: cf.F(zone.ID), Name: cf.F(domain)})
	if err != nil {
		t.Fatal(err)
	}
	records, err := api.EmailSending.Subdomains.DNS.Get(ctx, sending.Tag, email_sending.SubdomainDNSGetParams{ZoneID: cf.F(zone.ID)})
	if err != nil || len(records.Result) != 2 {
		t.Fatalf("EmailSending DNS: %v", err)
	}
	for _, record := range records.Result {
		existing, err := api.DNS.Records.List(ctx, dns.RecordListParams{
			ZoneID: cf.F(zone.ID), Name: cf.F(dns.RecordListParamsName{Exact: cf.F(record.Name)}),
			Type: cf.F(dns.RecordListParamsType(record.Type)),
		})
		if err != nil || len(existing.Result) != 0 {
			t.Fatalf("DNS list: %v", err)
		}
		if _, err := api.DNS.Records.New(ctx, dns.RecordNewParams{ZoneID: cf.F(zone.ID), Body: dns.RecordNewParamsBody{
			Name: cf.F(record.Name), TTL: cf.F(dns.TTL1), Type: cf.F(dns.RecordNewParamsBodyType(record.Type)), Content: cf.F(record.Content),
		}}); err != nil {
			t.Fatal(err)
		}
	}

	rules, err := api.EmailRouting.Rules.List(ctx, email_routing.RuleListParams{ZoneID: cf.F(zone.ID), PerPage: cf.F(50.0)})
	if err != nil || len(rules.Result) != 0 {
		t.Fatalf("Rules.List: %v", err)
	}
	current, err := api.EmailRouting.Rules.CatchAlls.Get(ctx, email_routing.RuleCatchAllGetParams{ZoneID: cf.F(zone.ID)})
	if err != nil || len(current.Actions) != 1 || current.Actions[0].Value[0] != name {
		t.Fatalf("CatchAlls.Get: %+v %v", current, err)
	}
	if _, err := api.Workers.Scripts.Delete(ctx, name, workers.ScriptDeleteParams{AccountID: account}); err != nil {
		t.Fatal(err)
	}
	if _, err := api.D1.Database.Delete(ctx, database.UUID, d1.DatabaseDeleteParams{AccountID: account}); err != nil {
		t.Fatal(err)
	}
	if _, err := api.R2.Buckets.Delete(ctx, name+"-raw", r2.BucketDeleteParams{AccountID: account}); err != nil {
		t.Fatal(err)
	}
	if len(fake.scripts) != 0 || len(fake.databases) != 0 || len(fake.buckets) != 0 {
		t.Fatalf("left behind: %v %v %v", fake.scripts, fake.databases, fake.buckets)
	}
}
