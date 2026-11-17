package main

import (
	"context"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/resend"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type removeGatewayResendFlags struct {
	domain   string
	endpoint string
	purge    bool
	yes      bool
}

func newRemoveGatewayResendCommand() *cobra.Command {
	flags := removeGatewayResendFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-resend",
		Short: "Remove the Resend gateway",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if flags.endpoint != "" {
				return removeGatewayResendRemote(cmd.Context(), flags.domain, flags.endpoint)
			}
			return removeComponent(cmd.Context(), "gateway-resend", flags.yes, components.Options{Domain: flags.domain, Purge: flags.purge})
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().StringVar(&flags.endpoint, "endpoint", "", "away from the server: where the gateway runs")
	cmd.Flags().BoolVar(&flags.purge, "purge", false, "also delete the component's data")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}

func removeGatewayResendRemote(ctx context.Context, rawDomain, endpoint string) error {
	domain, err := remoteGatewayDomain(rawDomain)
	if err != nil {
		return err
	}
	key := resend.KeyFromEnv()
	if key == "" {
		if key, err = ui.Secret(ctx, "Resend API key", "Set "+resend.KeyVariable+" to skip this question."); err != nil {
			return err
		}
	}
	deleted, err := resend.New(key).DeleteWebhooksTo(ctx, strings.TrimRight(endpoint, "/")+"/webhooks/resend")
	if err != nil {
		return err
	}
	ui.Done("Deleted %d Resend webhook(s) to %s", deleted, endpoint)
	printRemoteGatewayRemoved("gateway-resend", domain)
	return nil
}
