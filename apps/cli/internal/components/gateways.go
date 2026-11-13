package components

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"golang.org/x/mod/semver"

	"github.com/trymetis/metis/apps/cli/internal/cloudflare"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/resend"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
	"github.com/trymetis/metis/apps/cli/internal/ses"
	"github.com/trymetis/metis/apps/cli/internal/sqld"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

const (
	cloudflareServersKey = "METIS_CLOUDFLARE_SERVERS"
	resendServersKey     = "METIS_RESEND_SERVERS"
	sesServersKey        = "METIS_SES_SERVERS"
	resendEnvFile        = "gateway-resend.env"
	sqldResendEnvFile    = "sqld-resend.env"
	verifyEvery          = 15 * time.Second
	verifyFor            = 10 * time.Minute
)

func init() {
	Register(cloudflareGateway{})
	Register(resendGateway{})
	Register(sesGateway{})
}

func IsGateway(name string) bool {
	return strings.HasPrefix(name, "gateway-")
}

func progress(line string) {
	ui.Done("%s", line)
}

func gatewayEntry(id, domain, endpoint string) map[string]any {
	return map[string]any{"id": id, "name": domain, "domain": domain, "endpoint": endpoint}
}

func PrintEntry(key string, entry map[string]any) {
	raw, _ := json.Marshal(entry)
	list, _ := json.Marshal([]map[string]any{entry})
	ui.Info("")
	ui.Info("Add this server under Dashboard → System, or store it with metis config set --env-file:")
	ui.Info("  %s", raw)
	ui.Info("  %s=%s", key, list)
}

func versionNote(ctx context.Context, track, version string) string {
	if version == "" {
		return version
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	newest, err := gateways.Latest(ctx, track)
	if err != nil || newest == version || semver.Compare("v"+newest, "v"+version) <= 0 {
		return version
	}
	return version + ", " + newest + " is out: run metis add again to move it"
}

func cloudflareClient(ctx context.Context, required bool) (*cloudflare.Client, error) {
	client, set, err := cloudflare.FromEnv(ctx)
	if set || err != nil {
		return client, err
	}
	if !required {
		return nil, nil
	}
	token, err := ui.Secret(ctx, "Cloudflare API token", "Needs "+cloudflare.TokenPermissions+". Set "+cloudflare.TokenVariable+" to skip this question.")
	if err != nil {
		return nil, fmt.Errorf("%s is not set: %w", cloudflare.TokenVariable, err)
	}
	return cloudflare.New(ctx, token)
}

func PublishRecords(ctx context.Context, domain string, records []cloudflare.Record) error {
	client, err := cloudflareClient(ctx, false)
	if err != nil {
		return err
	}
	if client != nil {
		zone, zoneErr := client.Zone(ctx, domain)
		if zoneErr == nil {
			for _, record := range records {
				created, err := client.EnsureRecord(ctx, zone, record)
				if err != nil {
					return err
				}
				if created {
					progress("DNS " + record.String())
				}
			}
			return nil
		}
		ui.Warn("%v; add the records yourself", zoneErr)
	}
	ui.Info("Add these DNS records at your DNS provider:")
	for _, record := range records {
		ui.Info("  %s", record.String())
	}
	return nil
}

type cloudflareGateway struct{}

func (cloudflareGateway) Name() string                  { return "gateway-cloudflare" }
func (cloudflareGateway) Requires() []string            { return nil }
func (cloudflareGateway) Validate(*state.State) error   { return nil }
func (cloudflareGateway) Warning(*Install, bool) string { return "" }

func (cloudflareGateway) Status(ctx context.Context, st *state.State) (string, bool) {
	if len(st.Components.GatewayCloudflare) == 0 {
		return "", false
	}
	var parts []string
	for domain, gateway := range st.Components.GatewayCloudflare {
		parts = append(parts, domain+" "+versionNote(ctx, gateways.Cloudflare, gateway.Version))
	}
	slices.Sort(parts)
	return strings.Join(parts, "; "), true
}

const cloudflareRequirements = "Needs: the domain's zone on this Cloudflare account, Workers Paid (Email Sending to any recipient), and Email Sending, which is in beta."

func CloudflareEnvFile(domain string) string {
	return "gateway-cloudflare-" + gateways.Slug(domain) + ".env"
}

func DeployCloudflare(ctx context.Context, opts Options, release, cacheDir, apiToken string) (cloudflare.Gateway, error) {
	ui.Info("%s", cloudflareRequirements)
	client, err := cloudflareClient(ctx, true)
	if err != nil {
		return cloudflare.Gateway{}, err
	}
	return client.DeployGateway(ctx, cloudflare.GatewayParams{
		Domain: opts.Domain, Addresses: opts.Addresses, Release: release, CacheDir: cacheDir, APIToken: apiToken,
	}, progress)
}

func (cloudflareGateway) Add(ctx context.Context, in *Install, opts Options) error {
	domain := gateways.NormalizeDomain(opts.Domain)
	if domain == "" {
		return errors.New("pass --domain example.com")
	}
	env, err := in.EnvFile(CloudflareEnvFile(domain))
	if err != nil {
		return err
	}
	if env.Value("API_TOKEN") == "" {
		env.Set("API_TOKEN", secrets.Hex(32))
	}
	opts.Domain = domain
	release, err := gateways.Resolve(ctx, gateways.Cloudflare, opts.Version)
	if err != nil {
		return err
	}
	deployed, err := DeployCloudflare(ctx, opts, release, filepath.Join(in.Dir, "cache"), env.Value("API_TOKEN"))
	if err != nil {
		return err
	}
	if in.State.Components.GatewayCloudflare == nil {
		in.State.Components.GatewayCloudflare = map[string]state.GatewayCloudflare{}
	}
	in.State.Components.GatewayCloudflare[domain] = state.GatewayCloudflare{
		AccountID: deployed.AccountID, ZoneID: deployed.ZoneID, D1ID: deployed.D1ID,
		Endpoint: deployed.Endpoint, Addresses: opts.Addresses, Version: release,
	}
	return SetServerEntry(in, cloudflareServersKey, "metis-cloudflare-"+gateways.Slug(domain), gatewayEntry("metis-cloudflare-"+gateways.Slug(domain), domain, deployed.Endpoint))
}

func RemoveCloudflare(ctx context.Context, domain string, purge bool) error {
	client, err := cloudflareClient(ctx, true)
	if err != nil {
		return err
	}
	return client.RemoveGateway(ctx, domain, purge, progress)
}

func (cloudflareGateway) Remove(ctx context.Context, in *Install, opts Options) error {
	domain := gateways.NormalizeDomain(opts.Domain)
	if _, ok := in.State.Components.GatewayCloudflare[domain]; !ok {
		return fmt.Errorf("no Cloudflare gateway serves %s; pass --domain", opts.Domain)
	}
	if err := RemoveCloudflare(ctx, domain, opts.Purge); err != nil {
		return err
	}
	delete(in.State.Components.GatewayCloudflare, domain)
	if len(in.State.Components.GatewayCloudflare) == 0 {
		in.State.Components.GatewayCloudflare = nil
	}
	in.RemoveEnvFile(CloudflareEnvFile(domain))
	return SetServerEntry(in, cloudflareServersKey, "metis-cloudflare-"+gateways.Slug(domain), nil)
}

type resendGateway struct{}

func (resendGateway) Name() string       { return "gateway-resend" }
func (resendGateway) Requires() []string { return nil }

func (resendGateway) Validate(st *state.State) error {
	if st.Components.Caddy == nil {
		return errors.New("the Resend gateway needs a public HTTPS address for its webhook; run metis domain mail.example.com first")
	}
	return nil
}

func (resendGateway) Warning(in *Install, adding bool) string {
	if adding || in.State.Components.GatewayResend == nil {
		return ""
	}
	return "Mailboxes connected through this gateway are quarantined when the app restarts."
}

func (resendGateway) Status(ctx context.Context, st *state.State) (string, bool) {
	gateway := st.Components.GatewayResend
	if gateway == nil {
		return "", false
	}
	return fmt.Sprintf("%s on https://%s, %s", gateway.Domain, gateway.Host, versionNote(ctx, gateways.Resend, gateway.Version)), true
}

func resendKey(ctx context.Context, stored string) (string, error) {
	if key := resend.KeyFromEnv(); key != "" {
		return key, nil
	}
	if stored != "" {
		return stored, nil
	}
	key, err := ui.Secret(ctx, "Resend API key", "A key with full access. Set "+resend.KeyVariable+" to skip this question.")
	if err != nil {
		return "", fmt.Errorf("%s is not set: %w", resend.KeyVariable, err)
	}
	return key, nil
}

type ResendDomain struct {
	Client *resend.Client
	Domain resend.Domain
	Key    string
}

func SetUpResendDomain(ctx context.Context, opts Options, storedKey string, extra []cloudflare.Record) (ResendDomain, error) {
	key, err := resendKey(ctx, storedKey)
	if err != nil {
		return ResendDomain{}, err
	}
	region := opts.Region
	if region == "" {
		region = resend.Regions[0]
	}
	if !slices.Contains(resend.Regions, region) {
		return ResendDomain{}, fmt.Errorf("--region takes %s", strings.Join(resend.Regions, ", "))
	}
	client := resend.New(key)
	domain, err := client.EnsureDomain(ctx, opts.Domain, region)
	if err != nil {
		return ResendDomain{}, err
	}
	progress("Resend domain " + domain.Name)
	records := slices.Clone(extra)
	for _, record := range domain.Records {
		records = append(records, cloudflare.Record{Type: record.Type, Name: record.Name, Value: record.Value, Priority: record.Priority})
	}
	if err := PublishRecords(ctx, opts.Domain, records); err != nil {
		return ResendDomain{}, err
	}
	if domain.Status != "verified" {
		if err := client.Verify(ctx, domain.ID); err != nil {
			return ResendDomain{}, fmt.Errorf("asking Resend to verify %s: %w", domain.Name, err)
		}
		ui.Info("Waiting for Resend to verify %s (up to 10 minutes)…", domain.Name)
		verified, err := client.WaitVerified(ctx, domain.ID, verifyEvery, verifyFor)
		if err != nil {
			var lines []string
			for _, record := range verified.Records {
				lines = append(lines, fmt.Sprintf("  %s %s: %s", record.Record, record.Name, record.Status))
			}
			return ResendDomain{}, fmt.Errorf("%w\n%s\nRun the same command again once DNS has spread", err, strings.Join(lines, "\n"))
		}
		domain = verified
	}
	progress("Resend verified " + domain.Name)
	return ResendDomain{Client: client, Domain: domain, Key: key}, nil
}

func createBucket(ctx context.Context, in *Install, keyID, secret, bucket string) error {
	addr, err := in.Stack.PublishedPort(ctx, "metis-objstore", "9000/tcp")
	if err != nil {
		return err
	}
	client := s3.New(s3.Options{
		BaseEndpoint: aws.String("http://" + addr),
		Region:       "us-east-1",
		UsePathStyle: true,
		Credentials:  credentials.NewStaticCredentialsProvider(keyID, secret, ""),
	})
	_, err = client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)})
	if err != nil && !strings.Contains(err.Error(), "BucketAlreadyOwnedByYou") && !strings.Contains(err.Error(), "BucketAlreadyExists") {
		return fmt.Errorf("creating the bucket %s on objstore: %w", bucket, err)
	}
	return nil
}

func (resendGateway) Add(ctx context.Context, in *Install, opts Options) error {
	domain := gateways.NormalizeDomain(opts.Domain)
	if domain == "" {
		return errors.New("pass --domain example.com")
	}
	host := strings.ToLower(opts.Host)
	if host == "" {
		host = "resend." + in.State.Components.Caddy.Domain
	}
	database := opts.Database
	if database == "" {
		database = "own"
	}
	blobs := opts.Blobs
	if blobs == "" {
		blobs = "dir"
	}
	if database != "own" && database != "stack" {
		return errors.New("--database takes own or stack")
	}
	if database == "stack" && in.State.Components.Sqld == nil {
		return errors.New("--database stack needs the server's sqld")
	}
	if blobs != "dir" && blobs != "objstore" {
		return errors.New("--blobs takes dir or objstore")
	}
	if blobs == "objstore" && in.State.Components.Objstore == nil {
		return errors.New("--blobs objstore needs metis add objstore first")
	}
	env, err := in.EnvFile(resendEnvFile)
	if err != nil {
		return err
	}
	var extra []cloudflare.Record
	if ip, err := cloudflare.PublicIPv4(ctx); err == nil {
		extra = append(extra, cloudflare.Record{Type: "A", Name: host, Value: ip})
	}
	opts.Domain = domain
	setUp, err := SetUpResendDomain(ctx, opts, env.Value("RESEND_API_KEY"), extra)
	if err != nil {
		return err
	}
	if env.Value("API_TOKEN") == "" {
		env.Set("API_TOKEN", secrets.Hex(32))
	}
	env.Set("MAIL_DOMAIN", domain)
	env.Set("RESEND_API_KEY", setUp.Key)
	env.Set("POLL_INTERVAL_SEC", "300")
	if database == "own" {
		sqldEnv, err := in.EnvFile(sqldResendEnvFile)
		if err != nil {
			return err
		}
		if sqldEnv.Value("SQLD_AUTH_JWT_KEY") == "" || !strings.HasPrefix(env.Value("DATABASE_URL"), "http://sqld-resend") {
			auth, err := secrets.NewSqldAuth()
			if err != nil {
				return err
			}
			sqldEnv.Set("SQLD_AUTH_JWT_KEY", auth.JWTKey)
			env.Set("DATABASE_AUTH_TOKEN", auth.Token)
		}
		env.Set("DATABASE_URL", "http://sqld-resend:8080")
	} else {
		in.RemoveEnvFile(sqldResendEnvFile)
		env.Set("DATABASE_URL", StackResendDatabaseURL)
		env.Set("DATABASE_AUTH_TOKEN", in.Env.Value("DATABASE_AUTH_TOKEN"))
		in.Notice("The gateway's mail and tokens live on the server's sqld, so Undo last upgrade also rolls them back")
	}
	for _, key := range []string{"BLOB_ENDPOINT", "BLOB_BUCKET", "BLOB_KEY_ID", "BLOB_SECRET", "BLOB_DIR"} {
		env.Unset(key)
	}
	if blobs == "objstore" {
		objstoreEnv, err := in.EnvFile(objstoreEnvFile)
		if err != nil {
			return err
		}
		keyID, secret := objstoreEnv.Value("RUSTFS_ACCESS_KEY"), objstoreEnv.Value("RUSTFS_SECRET_KEY")
		env.Set("BLOB_ENDPOINT", "http://objstore:9000")
		env.Set("BLOB_BUCKET", "gateway-resend")
		env.Set("BLOB_KEY_ID", keyID)
		env.Set("BLOB_SECRET", secret)
		in.Before = append(in.Before, func(ctx context.Context) error {
			return createBucket(ctx, in, keyID, secret, "gateway-resend")
		})
	} else {
		env.Set("BLOB_DIR", "/data/blobs")
	}
	previous := in.State.Components.GatewayResend
	webhookID := ""
	if previous != nil && previous.Host == host && env.Value("RESEND_WEBHOOK_SECRET") != "" {
		webhookID = previous.WebhookID
	} else {
		if previous != nil && previous.WebhookID != "" {
			_ = setUp.Client.DeleteWebhook(ctx, previous.WebhookID)
		}
		webhook, err := setUp.Client.CreateWebhook(ctx, "https://"+host+"/webhooks/resend")
		if err != nil {
			return fmt.Errorf("creating the Resend webhook: %w", err)
		}
		webhookID = webhook.ID
		env.Set("RESEND_WEBHOOK_SECRET", webhook.SigningSecret)
		progress("Resend webhook to https://" + host + "/webhooks/resend")
	}
	release, err := gateways.Resolve(ctx, gateways.Resend, opts.Version)
	if err != nil {
		return err
	}
	in.State.Components.GatewayResend = &state.GatewayResend{
		Domain: domain, Host: host, Database: database, Blobs: blobs, Version: release,
		ResendDomainID: setUp.Domain.ID, WebhookID: webhookID,
	}
	apiToken := env.Value("API_TOKEN")
	in.After = append(in.After, func(ctx context.Context) error {
		ui.Info("Waiting for https://%s to answer (Caddy may first need a certificate)…", host)
		return gateways.WaitHealthy(ctx, "https://"+host, apiToken, 3*time.Minute)
	})
	id := "metis-resend-" + gateways.Slug(domain)
	return SetServerEntry(in, resendServersKey, id, gatewayEntry(id, domain, "https://"+host))
}

func (resendGateway) Remove(ctx context.Context, in *Install, opts Options) error {
	gateway := in.State.Components.GatewayResend
	if gateway == nil {
		return errors.New("the Resend gateway is not on")
	}
	env, err := in.EnvFile(resendEnvFile)
	if err != nil {
		return err
	}
	if key := env.Value("RESEND_API_KEY"); key != "" && gateway.WebhookID != "" {
		if err := resend.New(key).DeleteWebhook(ctx, gateway.WebhookID); err != nil {
			return fmt.Errorf("deleting the Resend webhook: %w", err)
		}
		progress("Deleted the Resend webhook")
	}
	in.State.Components.GatewayResend = nil
	in.RemoveEnvFile(resendEnvFile)
	if opts.Purge {
		in.Purge = append(in.Purge, "metis-gateway-resend")
		if gateway.Database == "own" {
			in.Purge = append(in.Purge, "metis-sqld-resend")
		} else {
			adminKey := in.Env.Value("SQLD_ADMIN_KEY")
			in.After = append(in.After, func(ctx context.Context) error {
				addr, err := in.Stack.PublishedPort(ctx, sqld.Container, sqld.AdminPort)
				if err != nil {
					return err
				}
				return sqld.DeleteNamespace(ctx, addr, adminKey, sqld.ResendNamespace)
			})
		}
	}
	if gateway.Database == "own" {
		in.RemoveEnvFile(sqldResendEnvFile)
	}
	return SetServerEntry(in, resendServersKey, "metis-resend-"+gateways.Slug(gateway.Domain), nil)
}

type sesGateway struct{}

func (sesGateway) Name() string                  { return "gateway-ses" }
func (sesGateway) Requires() []string            { return nil }
func (sesGateway) Validate(*state.State) error   { return nil }
func (sesGateway) Warning(*Install, bool) string { return "" }

func (sesGateway) Status(ctx context.Context, st *state.State) (string, bool) {
	if len(st.Components.GatewaySES) == 0 {
		return "", false
	}
	var parts []string
	for domain, gateway := range st.Components.GatewaySES {
		part := fmt.Sprintf("%s in %s %s", domain, gateway.Region, versionNote(ctx, gateways.SES, gateway.Version))
		if client, err := ses.New(ctx, gateway.Region); err == nil {
			if failed, err := client.FailedReceipts(ctx, domain); err == nil && failed > 0 {
				part += fmt.Sprintf(", %d failed receipt(s) in %s-failed", failed, ses.ResourceName(domain))
			}
		}
		parts = append(parts, part)
	}
	slices.Sort(parts)
	return strings.Join(parts, "; "), true
}

func SESEnvFile(domain string) string {
	return "gateway-ses-" + gateways.Slug(domain) + ".env"
}

func DeploySES(ctx context.Context, opts Options, release, cacheDir, apiToken, website, contact string) (*ses.Client, ses.Gateway, error) {
	if opts.Region == "" {
		return nil, ses.Gateway{}, fmt.Errorf("pass --region, one of %s", strings.Join(ses.ReceivingRegions, ", "))
	}
	if opts.DatabaseURL == "" {
		return nil, ses.Gateway{}, errors.New("pass --database-url and --database-token: a libSQL database Lambda can reach over the internet, such as Turso")
	}
	client, err := ses.New(ctx, opts.Region)
	if err != nil {
		return nil, ses.Gateway{}, err
	}
	progress(fmt.Sprintf("AWS account %s, %s", client.Account, client.Region))
	schema, err := gateways.SourceFile(ctx, gateways.SES, release, "apps/gateway-ses/schema.sql")
	if err != nil {
		return nil, ses.Gateway{}, err
	}
	if err := ses.ApplySchema(ctx, opts.DatabaseURL, opts.DatabaseToken, string(schema)); err != nil {
		return nil, ses.Gateway{}, err
	}
	progress("Database schema")
	records, verified, err := client.Identity(ctx, opts.Domain)
	if err != nil {
		return nil, ses.Gateway{}, err
	}
	if err := PublishRecords(ctx, opts.Domain, records); err != nil {
		return nil, ses.Gateway{}, err
	}
	if !verified {
		ui.Info("Waiting for SES to verify %s (up to 10 minutes)…", opts.Domain)
		if err := client.WaitVerified(ctx, opts.Domain, verifyEvery, verifyFor); err != nil {
			return nil, ses.Gateway{}, fmt.Errorf("%w\nRun the same command again once DNS has spread", err)
		}
	}
	progress("SES verified " + opts.Domain)
	production, err := client.ProductionAccess(ctx)
	if err != nil {
		return nil, ses.Gateway{}, err
	}
	if !production {
		ui.Warn("SES in %s is in the sandbox: it sends only to verified addresses, at most 200 messages per 24 hours and 1 per second.", client.Region)
		ask, err := ui.Confirm(ctx, "Ask AWS for production access now?", "AWS answers within 96 hours; mail still arrives meanwhile.", false)
		if err == nil && ask {
			if err := client.RequestProductionAccess(ctx, website, contact); err != nil {
				ui.Warn("The request failed (%v); ask from the SES console's Account dashboard", err)
			} else {
				progress("Asked AWS for production access")
			}
		}
	}
	deployed, err := client.Deploy(ctx, ses.Params{
		Domain: opts.Domain, Release: release, CacheDir: cacheDir,
		DatabaseURL: opts.DatabaseURL, DatabaseToken: opts.DatabaseToken, APIToken: apiToken,
	}, progress)
	return client, deployed, err
}

func (sesGateway) Add(ctx context.Context, in *Install, opts Options) error {
	domain := gateways.NormalizeDomain(opts.Domain)
	if domain == "" {
		return errors.New("pass --domain example.org")
	}
	opts.Domain = domain
	env, err := in.EnvFile(SESEnvFile(domain))
	if err != nil {
		return err
	}
	if env.Value("API_TOKEN") == "" {
		env.Set("API_TOKEN", secrets.Hex(32))
	}
	website := "https://" + domain
	if origin := AppOrigin(in); origin != "" {
		website = origin
	}
	release, err := gateways.Resolve(ctx, gateways.SES, opts.Version)
	if err != nil {
		return err
	}
	client, deployed, err := DeploySES(ctx, opts, release, filepath.Join(in.Dir, "cache"), env.Value("API_TOKEN"), website, in.Env.Value("METIS_OWNER_EMAIL"))
	if err != nil {
		return err
	}
	if in.State.Components.GatewaySES == nil {
		in.State.Components.GatewaySES = map[string]state.GatewaySES{}
	}
	in.State.Components.GatewaySES[domain] = state.GatewaySES{
		Region: client.Region, Account: client.Account, Endpoint: deployed.Endpoint, RuleSet: deployed.RuleSet, Version: release,
	}
	id := ses.ResourceName(domain)
	return SetServerEntry(in, sesServersKey, id, gatewayEntry(id, domain, deployed.Endpoint))
}

func RemoveSES(ctx context.Context, domain, region string, purge bool) error {
	client, err := ses.New(ctx, region)
	if err != nil {
		return err
	}
	return client.Remove(ctx, domain, purge, progress)
}

func (sesGateway) Remove(ctx context.Context, in *Install, opts Options) error {
	domain := gateways.NormalizeDomain(opts.Domain)
	gateway, ok := in.State.Components.GatewaySES[domain]
	if !ok {
		return fmt.Errorf("no SES gateway serves %s; pass --domain", opts.Domain)
	}
	if err := RemoveSES(ctx, domain, gateway.Region, opts.Purge); err != nil {
		return err
	}
	delete(in.State.Components.GatewaySES, domain)
	if len(in.State.Components.GatewaySES) == 0 {
		in.State.Components.GatewaySES = nil
	}
	in.RemoveEnvFile(SESEnvFile(domain))
	return SetServerEntry(in, sesServersKey, ses.ResourceName(domain), nil)
}

func ServerKey(component string) string {
	switch component {
	case "gateway-cloudflare":
		return cloudflareServersKey
	case "gateway-resend":
		return resendServersKey
	case "gateway-ses":
		return sesServersKey
	}
	return ""
}

func ServerID(component, domain string) string {
	switch component {
	case "gateway-cloudflare":
		return "metis-cloudflare-" + gateways.Slug(domain)
	case "gateway-resend":
		return "metis-resend-" + gateways.Slug(domain)
	case "gateway-ses":
		return ses.ResourceName(domain)
	}
	return ""
}

func GatewayEntry(component, domain, endpoint string) map[string]any {
	return gatewayEntry(ServerID(component, domain), domain, endpoint)
}

type GatewayAccess struct {
	Endpoint   string
	AdminToken string
}

func FindGateway(in *Install, domain string) (GatewayAccess, error) {
	domain = gateways.NormalizeDomain(domain)
	st := in.State.Components
	file := ""
	endpoint := ""
	if gateway, ok := st.GatewayCloudflare[domain]; ok {
		file, endpoint = CloudflareEnvFile(domain), gateway.Endpoint
	} else if gateway, ok := st.GatewaySES[domain]; ok {
		file, endpoint = SESEnvFile(domain), gateway.Endpoint
	} else if st.GatewayResend != nil && st.GatewayResend.Domain == domain {
		file, endpoint = resendEnvFile, "https://"+st.GatewayResend.Host
	} else {
		return GatewayAccess{}, fmt.Errorf("no gateway on this server serves %s", domain)
	}
	env, err := in.EnvFile(file)
	if err != nil {
		return GatewayAccess{}, err
	}
	return GatewayAccess{Endpoint: endpoint, AdminToken: env.Value("API_TOKEN")}, nil
}
