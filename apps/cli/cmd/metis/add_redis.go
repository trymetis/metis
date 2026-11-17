package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newAddRedisCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "redis",
		Short: "Run Redis for the cache and the job queue",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return addComponent(cmd.Context(), "redis", yes, components.Options{})
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
