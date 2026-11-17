package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

func newRemoveWorkerCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "worker",
		Short: "Remove the worker containers",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return removeComponent(cmd.Context(), "worker", yes, components.Options{})
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return cmd
}
