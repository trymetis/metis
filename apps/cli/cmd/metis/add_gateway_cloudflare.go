package main

import (
	"context"
	"os"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
)

type addGatewayCloudflareFlags struct {
	domain    string
	addresses []string
	version   string
	remote    bool
	yes       bool
}

func newAddGatewayCloudflareCommand() *cobra.Command {
	flags := addGatewayCloudflareFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-cloudflare",
		Short: "Set up the Cloudflare Email gateway for a domain",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			opts := components.Options{Domain: flags.domain, Addresses: flags.addresses, Version: flags.version}
			if flags.remote {
				return addGatewayCloudflareRemote(cmd.Context(), opts)
			}
			return addComponent(cmd.Context(), "gateway-cloudflare", flags.yes, opts)
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().StringSliceVar(&flags.addresses, "addresses", nil, "route only these addresses instead of the whole domain")
	cmd.Flags().StringVar(&flags.version, "version", "", "the gateway release to deploy (default: its newest)")
	cmd.Flags().BoolVar(&flags.remote, "remote", false, "work against the cloud account only and print the server entry")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}

func addGatewayCloudflareRemote(ctx context.Context, opts components.Options) error {
	domain, err := remoteGatewayDomain(opts.Domain)
	if err != nil {
		return err
	}
	opts.Domain = domain
	apiToken := secrets.Hex(32)
	release, err := gateways.Resolve(ctx, gateways.Cloudflare, opts.Version)
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
	printRemoteGateway("gateway-cloudflare", opts.Domain, deployed.Endpoint, apiToken)
	return nil
}
