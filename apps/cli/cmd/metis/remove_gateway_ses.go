package main

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

type removeGatewaySESFlags struct {
	domain string
	region string
	remote bool
	purge  bool
	yes    bool
}

func newRemoveGatewaySESCommand() *cobra.Command {
	flags := removeGatewaySESFlags{}
	cmd := &cobra.Command{
		Use:   "gateway-ses",
		Short: "Remove the Amazon SES gateway",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !flags.remote {
				return removeComponent(cmd.Context(), "gateway-ses", flags.yes, components.Options{Domain: flags.domain, Region: flags.region, Purge: flags.purge})
			}
			domain, err := remoteGatewayDomain(flags.domain)
			if err != nil {
				return err
			}
			if flags.region == "" {
				return errors.New("pass --region, the gateway's region")
			}
			if err := components.RemoveSES(cmd.Context(), domain, flags.region, flags.purge); err != nil {
				return err
			}
			printRemoteGatewayRemoved("gateway-ses", domain)
			return nil
		},
	}
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the mail domain")
	cmd.Flags().StringVar(&flags.region, "region", "", "with --remote: the gateway's region")
	cmd.Flags().BoolVar(&flags.remote, "remote", false, "work against the cloud account only and print the server entry")
	cmd.Flags().BoolVar(&flags.purge, "purge", false, "also delete the component's data")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}
