package main

import "github.com/spf13/cobra"

func newExportRecipientsCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "recipients",
		Short: "Manage the public keys this server's exports are encrypted to",
	}
	cmd.AddCommand(newExportRecipientsAddCommand(), newExportRecipientsListCommand(), newExportRecipientsRemoveCommand())
	return needsRoot(modes(cmd, modeServer))
}
