package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type addGatewayResendFlags struct {
	domain   string
	host     string
	database string
	blobs    string
	region   string
	version  string
	endpoint string
	yes      bool
}

func newAddGatewayResendCommand() *cobra.Command {
	flags := addGatewayResendFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-resend",
		Short: "Set up the Resend gateway for a domain",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			opts := components.Options{
				Domain: flags.domain, Host: flags.host, Database: flags.database,
				Blobs: flags.blobs, Region: flags.region, Version: flags.version,
			}
			if flags.endpoint != "" {
				return addGatewayResendRemote(cmd.Context(), flags.endpoint, opts)
			}
			return addComponent(cmd.Context(), "gateway-resend", flags.yes, opts)
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().StringVar(&flags.host, "host", "", "its public host (default resend. plus the domain Metis runs on)")
	cmd.Flags().StringVar(&flags.database, "database", "", "own (its own sqld, the default) or stack (a namespace on the server's sqld)")
	cmd.Flags().StringVar(&flags.blobs, "blobs", "", "dir (the default) or objstore")
	cmd.Flags().StringVar(&flags.region, "region", "", "the Resend region")
	cmd.Flags().StringVar(&flags.version, "version", "", "the gateway release to deploy (default: its newest)")
	cmd.Flags().StringVar(&flags.endpoint, "endpoint", "", "away from the server: where the gateway runs")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}

func addGatewayResendRemote(ctx context.Context, rawEndpoint string, opts components.Options) error {
	domain, err := remoteGatewayDomain(opts.Domain)
	if err != nil {
		return err
	}
	opts.Domain = domain
	apiToken := secrets.Hex(32)
	endpoint := strings.TrimRight(rawEndpoint, "/")
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
	components.PrintEntry(components.ServerKey("gateway-resend"), components.GatewayEntry("gateway-resend", opts.Domain, endpoint))
	return nil
}
