package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newRemoveRedisCommand() *cobra.Command {
	purge, yes := false, false
	cmd := &cobra.Command{
		Use:   "redis",
		Short: "Remove Redis",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return removeComponent(cmd.Context(), "redis", yes, components.Options{Purge: purge})
		},
	}
	cmd.Flags().BoolVar(&purge, "purge", false, "also delete the component's data")
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
