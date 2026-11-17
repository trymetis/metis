package main

import (
	"context"
	"os"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
)

type addGatewaySESFlags struct {
	domain        string
	region        string
	databaseURL   string
	databaseToken string
	version       string
	remote        bool
	yes           bool
}

func newAddGatewaySESCommand() *cobra.Command {
	flags := addGatewaySESFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-ses",
		Short: "Set up the Amazon SES gateway for a domain",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			opts := components.Options{
				Domain: flags.domain, Region: flags.region, DatabaseURL: flags.databaseURL,
				DatabaseToken: flags.databaseToken, Version: flags.version,
			}
			if flags.remote {
				return addGatewaySESRemote(cmd.Context(), opts)
			}
			return addComponent(cmd.Context(), "gateway-ses", flags.yes, opts)
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().StringVar(&flags.region, "region", "", "the SES receiving region")
	cmd.Flags().StringVar(&flags.databaseURL, "database-url", "", "a libSQL URL Lambda can reach")
	cmd.Flags().StringVar(&flags.databaseToken, "database-token", "", "the token for --database-url")
	cmd.Flags().StringVar(&flags.version, "version", "", "the gateway release to deploy (default: its newest)")
	cmd.Flags().BoolVar(&flags.remote, "remote", false, "work against the cloud account only and print the server entry")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}

func addGatewaySESRemote(ctx context.Context, opts components.Options) error {
	domain, err := remoteGatewayDomain(opts.Domain)
	if err != nil {
		return err
	}
	opts.Domain = domain
	apiToken := secrets.Hex(32)
	release, err := gateways.Resolve(ctx, gateways.SES, opts.Version)
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
	printRemoteGateway("gateway-ses", opts.Domain, deployed.Endpoint, apiToken)
	return nil
}
