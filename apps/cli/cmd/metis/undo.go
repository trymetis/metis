package main

import (
	"context"

	"github.com/spf13/cobra"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

func newUndoCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "undo",
		Short: "Undo the last upgrade: the previous release with its database snapshot",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runInProcess(cmd.Context(), func(_ context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error) {
				return manager.Rollback("")
			})
		},
	}
	return needsRoot(modes(cmd, modeServer))
}
