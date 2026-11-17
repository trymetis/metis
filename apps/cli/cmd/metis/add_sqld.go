package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newAddSqldCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "sqld",
		Short: "Run the app's database on this server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return addComponent(cmd.Context(), "sqld", yes, components.Options{})
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
