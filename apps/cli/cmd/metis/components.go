package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/resend"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

type componentFlags struct {
	replicas      int
	dataDir       string
	direct        bool
	systemd       bool
	docker        bool
	yes           bool
	purge         bool
	domain        string
	addresses     []string
	host          string
	database      string
	blobs         string
	region        string
	databaseURL   string
	databaseToken string
	remote        bool
	endpoint      string
	version       string
}

func (flags componentFlags) options() (components.Options, error) {
	opts := components.Options{
		Replicas: flags.replicas, DataDir: flags.dataDir, Direct: flags.direct, Purge: flags.purge,
		Domain: flags.domain, Addresses: flags.addresses, Host: flags.host, Database: flags.database,
		Blobs: flags.blobs, Region: flags.region, DatabaseURL: flags.databaseURL, DatabaseToken: flags.databaseToken,
	}
	switch {
	case flags.systemd && flags.docker:
		return opts, errors.New("pass --systemd or --docker, not both")
	case flags.systemd:
		opts.UpdaterMode = state.UpdaterSystemd
	case flags.docker:
		opts.UpdaterMode = state.UpdaterDocker
	}
	return opts, nil
}

func (flags componentFlags) remoteFor(name string) bool {
	if name == "gateway-resend" {
		return flags.endpoint != ""
	}
	return flags.remote
}

func componentNames() []string {
	var names []string
	for _, component := range components.All() {
		names = append(names, component.Name())
	}
	return names
}

func remoteRelease(flags componentFlags) (string, error) {
	release := strings.TrimPrefix(flags.version, "v")
	if !updater.IsReleaseVersion(release) {
		return "", errors.New("away from the server, pass --version X.Y.Z: the release the instance runs, so the gateway matches it")
	}
	return release, nil
}

func addRemote(ctx context.Context, name string, flags componentFlags, opts components.Options) error {
	opts.Domain = gateways.NormalizeDomain(opts.Domain)
	if opts.Domain == "" {
		return errors.New("pass --domain")
	}
	apiToken := secrets.Hex(32)
	endpoint := ""
	switch name {
	case "gateway-cloudflare":
		release, err := remoteRelease(flags)
		if err != nil {
			return err
		}
		cache, err := os.MkdirTemp("", "metis-gateway-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(cache)
		deployed, err := components.DeployCloudflare(ctx, opts, release, cache, apiToken)
		if err != nil {
			return err
		}
		endpoint = deployed.Endpoint
	case "gateway-ses":
		release, err := remoteRelease(flags)
		if err != nil {
			return err
		}
		cache, err := os.MkdirTemp("", "metis-gateway-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(cache)
		_, deployed, err := components.DeploySES(ctx, opts, release, cache, apiToken, "https://"+opts.Domain, "")
		if err != nil {
			return err
		}
		endpoint = deployed.Endpoint
	case "gateway-resend":
		endpoint = strings.TrimRight(flags.endpoint, "/")
		setUp, err := components.SetUpResendDomain(ctx, opts, "", nil)
		if err != nil {
			return err
		}
		webhook, err := setUp.Client.CreateWebhook(ctx, endpoint+"/webhooks/resend")
		if err != nil {
			return fmt.Errorf("creating the Resend webhook: %w", err)
		}
		ui.Info("")
		ui.Info("Set these on the gateway at %s:", endpoint)
		ui.Info("  MAIL_DOMAIN=%s", opts.Domain)
		ui.Info("  API_TOKEN=%s", apiToken)
		ui.Info("  RESEND_API_KEY=%s", setUp.Key)
		ui.Info("  RESEND_WEBHOOK_SECRET=%s", webhook.SigningSecret)
		components.PrintEntry(components.ServerKey(name), components.GatewayEntry(name, opts.Domain, endpoint))
		return nil
	default:
		return mode.ErrNoInstall
	}
	ui.Info("")
	ui.Info("The gateway's admin token (API_TOKEN), shown once; metis gateway token needs it:")
	ui.Info("  %s", apiToken)
	components.PrintEntry(components.ServerKey(name), components.GatewayEntry(name, opts.Domain, endpoint))
	return nil
}

func removeRemote(ctx context.Context, name string, flags componentFlags) error {
	domain := gateways.NormalizeDomain(flags.domain)
	if domain == "" {
		return errors.New("pass --domain")
	}
	switch name {
	case "gateway-cloudflare":
		if err := components.RemoveCloudflare(ctx, domain, flags.purge); err != nil {
			return err
		}
	case "gateway-ses":
		if flags.region == "" {
			return errors.New("pass --region, the gateway's region")
		}
		if err := components.RemoveSES(ctx, domain, flags.region, flags.purge); err != nil {
			return err
		}
	case "gateway-resend":
		key := resend.KeyFromEnv()
		if key == "" {
			var err error
			if key, err = ui.Secret(ctx, "Resend API key", "Set "+resend.KeyVariable+" to skip this question."); err != nil {
				return err
			}
		}
		deleted, err := resend.New(key).DeleteWebhooksTo(ctx, strings.TrimRight(flags.endpoint, "/")+"/webhooks/resend")
		if err != nil {
			return err
		}
		ui.Done("Deleted %d Resend webhook(s) to %s", deleted, flags.endpoint)
	default:
		return mode.ErrNoInstall
	}
	ui.Info("Remove the server %s from Dashboard → System, or drop it from %s.", components.ServerID(name, domain), components.ServerKey(name))
	return nil
}

func addComponentFlags(cmd *cobra.Command, flags *componentFlags, adding bool) {
	cmd.Flags().StringVar(&flags.domain, "domain", "", "gateways: the mail domain")
	cmd.Flags().BoolVar(&flags.remote, "remote", false, "gateway-cloudflare, gateway-ses: work against the cloud account only and print the server entry")
	cmd.Flags().StringVar(&flags.endpoint, "endpoint", "", "gateway-resend away from the server: where the gateway runs")
	cmd.Flags().StringVar(&flags.region, "region", "", "gateway-ses: the SES receiving region; gateway-resend: the Resend region")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	if !adding {
		cmd.Flags().BoolVar(&flags.purge, "purge", false, "also delete the component's data")
		return
	}
	cmd.Flags().IntVar(&flags.replicas, "replicas", 1, "worker: how many worker containers to run")
	cmd.Flags().StringVar(&flags.dataDir, "data-dir", "", "objstore: keep the data in this host folder instead of a volume")
	cmd.Flags().BoolVar(&flags.direct, "direct", false, "objstore: let browsers transfer files through storage. plus the domain")
	cmd.Flags().BoolVar(&flags.systemd, "systemd", false, "updater: run it as a systemd service (the default when systemd runs)")
	cmd.Flags().BoolVar(&flags.docker, "docker", false, "updater: run it as a container")
	cmd.Flags().StringSliceVar(&flags.addresses, "addresses", nil, "gateway-cloudflare: route only these addresses instead of the whole domain")
	cmd.Flags().StringVar(&flags.host, "host", "", "gateway-resend: its public host (default resend. plus the domain Metis runs on)")
	cmd.Flags().StringVar(&flags.database, "database", "", "gateway-resend: own (its own sqld, the default) or stack (a namespace on the server's sqld)")
	cmd.Flags().StringVar(&flags.blobs, "blobs", "", "gateway-resend: dir (the default) or objstore")
	cmd.Flags().StringVar(&flags.databaseURL, "database-url", "", "gateway-ses: a libSQL URL Lambda can reach")
	cmd.Flags().StringVar(&flags.databaseToken, "database-token", "", "gateway-ses: the token for --database-url")
	cmd.Flags().StringVar(&flags.version, "version", "", "away from the server: the release the instance runs")
}

func newAddCommand() *cobra.Command {
	flags := componentFlags{}
	cmd := &cobra.Command{
		Use:       "add COMPONENT",
		Short:     "Add a component, or change one that is already on",
		Args:      cobra.ExactArgs(1),
		ValidArgs: componentNames(),
		RunE: func(cmd *cobra.Command, args []string) error {
			component, err := components.Get(args[0])
			if err != nil {
				return err
			}
			if component.Name() == "caddy" {
				return errors.New("Caddy comes with a domain: run metis domain mail.example.com")
			}
			opts, err := flags.options()
			if err != nil {
				return err
			}
			if flags.remoteFor(component.Name()) {
				return addRemote(cmd.Context(), component.Name(), flags, opts)
			}
			if detected.Mode != mode.Server {
				return mode.ErrNoInstall
			}
			if os.Geteuid() != 0 {
				return errors.New("metis add changes the server; run it with sudo")
			}
			err = change(cmd.Context(), flags.yes,
				func(in *components.Install) string { return component.Warning(in, true) },
				func(in *components.Install) error {
					return components.AddWithRequirements(cmd.Context(), in, component, opts)
				})
			if err != nil {
				return err
			}
			ui.Done("%s is on", component.Name())
			return nil
		},
	}
	addComponentFlags(cmd, &flags, true)
	return modes(cmd, modeServer, modeRemote)
}

func newRemoveCommand() *cobra.Command {
	flags := componentFlags{}
	cmd := &cobra.Command{
		Use:       "remove COMPONENT",
		Short:     "Remove a component",
		Args:      cobra.ExactArgs(1),
		ValidArgs: componentNames(),
		RunE: func(cmd *cobra.Command, args []string) error {
			component, err := components.Get(args[0])
			if err != nil {
				return err
			}
			if component.Name() == "caddy" {
				return errors.New("Caddy goes with the domain: run metis domain --remove")
			}
			if flags.remoteFor(component.Name()) {
				return removeRemote(cmd.Context(), component.Name(), flags)
			}
			if detected.Mode != mode.Server {
				return mode.ErrNoInstall
			}
			if os.Geteuid() != 0 {
				return errors.New("metis remove changes the server; run it with sudo")
			}
			opts, err := flags.options()
			if err != nil {
				return err
			}
			err = change(cmd.Context(), flags.yes,
				func(in *components.Install) string { return component.Warning(in, false) },
				func(in *components.Install) error {
					if _, on := component.Status(cmd.Context(), in.State); !on {
						return fmt.Errorf("%s is not on", component.Name())
					}
					return component.Remove(cmd.Context(), in, opts)
				})
			if err != nil {
				return err
			}
			ui.Done("%s is off", component.Name())
			return nil
		},
	}
	addComponentFlags(cmd, &flags, false)
	return modes(cmd, modeServer, modeRemote)
}

func newGatewayCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "gateway",
		Short: "Work with a mail gateway",
	}
	var endpoint, adminToken string
	token := &cobra.Command{
		Use:   "token create|list|revoke ADDRESS",
		Short: "Mint, list or revoke mailbox tokens on the gateway that serves an address",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			action, address := args[0], strings.ToLower(strings.TrimSpace(args[1]))
			domain := address
			if _, after, ok := strings.Cut(address, "@"); ok {
				domain = after
			}
			access := components.GatewayAccess{Endpoint: endpoint, AdminToken: adminToken}
			if endpoint == "" {
				if detected.Mode != mode.Server {
					return errors.New("away from the server, pass --endpoint and --admin-token")
				}
				st, err := state.Load(detected.InstallDir)
				if err != nil {
					return err
				}
				in, err := components.NewInstall(detected.InstallDir, st)
				if err != nil {
					return err
				}
				if access, err = components.FindGateway(in, domain); err != nil {
					return err
				}
			} else if adminToken == "" {
				return errors.New("pass --admin-token, the gateway's API_TOKEN")
			}
			switch action {
			case "create":
				if !strings.Contains(address, "@") {
					return errors.New("create needs an address such as alice@example.com")
				}
				created, err := gateways.CreateToken(ctx, access.Endpoint, access.AdminToken, address)
				if err != nil {
					return err
				}
				ui.Info("Token for %s (shown once; paste it when connecting the mailbox):", address)
				_, err = fmt.Fprintln(cmd.OutOrStdout(), created)
				return err
			case "revoke":
				if err := gateways.RevokeToken(ctx, access.Endpoint, access.AdminToken, address); err != nil {
					return err
				}
				ui.Done("Revoked the token for %s", address)
				return nil
			case "list":
				tokens, err := gateways.ListTokens(ctx, access.Endpoint, access.AdminToken)
				if err != nil {
					return err
				}
				for _, entry := range tokens {
					if _, err := fmt.Fprintln(cmd.OutOrStdout(), string(entry)); err != nil {
						return err
					}
				}
				return nil
			}
			return fmt.Errorf("%s is not create, list or revoke", action)
		},
	}
	token.Flags().StringVar(&endpoint, "endpoint", "", "away from the server: the gateway's URL")
	token.Flags().StringVar(&adminToken, "admin-token", "", "away from the server: the gateway's API_TOKEN")
	cmd.AddCommand(token)
	return modes(cmd, modeServer, modeRemote)
}
