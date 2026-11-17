package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newRemoveSqldCommand() *cobra.Command {
	purge, yes := false, false
	cmd := &cobra.Command{
		Use:   "sqld",
		Short: "Stop running the app's database on this server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return removeComponent(cmd.Context(), "sqld", yes, components.Options{Purge: purge})
		},
	}
	cmd.Flags().BoolVar(&purge, "purge", false, "also delete the component's data")
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
