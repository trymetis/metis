package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

type removeGatewayCloudflareFlags struct {
	domain string
	remote bool
	purge  bool
	yes    bool
}

func newRemoveGatewayCloudflareCommand() *cobra.Command {
	flags := removeGatewayCloudflareFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-cloudflare",
		Short: "Remove the Cloudflare Email gateway",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !flags.remote {
				return removeComponent(cmd.Context(), "gateway-cloudflare", flags.yes, components.Options{Domain: flags.domain, Purge: flags.purge})
			}
			domain, err := remoteGatewayDomain(flags.domain)
			if err != nil {
				return err
			}
			if err := components.RemoveCloudflare(cmd.Context(), domain, flags.purge); err != nil {
				return err
			}
			printRemoteGatewayRemoved("gateway-cloudflare", domain)
			return nil
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().BoolVar(&flags.remote, "remote", false, "work against the cloud account only and print the server entry")
	cmd.Flags().BoolVar(&flags.purge, "purge", false, "also delete the component's data")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}
