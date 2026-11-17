package main

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/cloudflare"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newDomainSetCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "set HOST",
		Short: "Serve Metis on a domain with HTTPS",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			caddy, _ := components.Get("caddy")
			host := strings.ToLower(strings.TrimSuffix(args[0], "."))
			if err := validHost(host); err != nil {
				return err
			}
			if err := change(cmd.Context(), yes, nil, func(in *components.Install) error {
				return caddy.Add(cmd.Context(), in, components.Options{Domain: host})
			}); err != nil {
				return err
			}
			if ip, err := cloudflare.PublicIPv4(cmd.Context()); err == nil {
				if err := components.PublishRecords(cmd.Context(), host, []cloudflare.Record{{Type: "A", Name: host, Value: ip}}); err != nil {
					ui.Warn("%v", err)
				}
			}
			ui.Done("Metis is served on https://%s once its DNS points at this server", host)
			return nil
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
