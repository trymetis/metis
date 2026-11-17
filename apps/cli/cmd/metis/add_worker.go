package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newAddWorkerCommand() *cobra.Command {
	replicas, yes := 1, false
	cmd := &cobra.Command{
		Use:   "worker",
		Short: "Run background work in worker containers, or change how many",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return addComponent(cmd.Context(), "worker", yes, components.Options{Replicas: replicas})
		},
	}
	cmd.Flags().IntVar(&replicas, "replicas", 1, "how many worker containers to run")
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
