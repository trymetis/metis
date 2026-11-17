package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newDomainRemoveCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "remove",
		Short: "Stop serving the domain; Metis stays reachable on 127.0.0.1",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			caddy, _ := components.Get("caddy")
			if err := change(cmd.Context(), yes, nil, func(in *components.Install) error {
				return caddy.Remove(cmd.Context(), in, components.Options{})
			}); err != nil {
				return err
			}
			ui.Done("Metis is reachable on 127.0.0.1 only")
			return nil
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
