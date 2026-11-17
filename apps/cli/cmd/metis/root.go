package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newRootCommand() *cobra.Command {
	root := &cobra.Command{
		Use:          "metis",
		Short:        "Install and run a Metis Suite server",
		SilenceUsage: true,
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			return checkMode(cmd)
		},
	}
	root.PersistentFlags().BoolVar(&ui.Accessible, "accessible", false, "ask questions as plain prompts, for screen readers")
	root.AddCommand(
		newSetupCommand(),
		newStatusCommand(),
		newApplyCommand(),
		newAddCommand(),
		newRemoveCommand(),
		newLogsCommand(),
		newRestartCommand(),
		newDomainCommand(),
		newConfigCommand(),
		newConnectCommand(),
		newGatewayCommand(),
		newSqldAuthCommand(),
		newKeygenCommand(),
		newDBCommand(),
		newExportCommand(),
		newUpdateCommand(),
		newUndoCommand(),
		newSelfUpdateCommand(),
		newVersionCommand(),
		newUpdaterCommand(),
	)
	return root
}
