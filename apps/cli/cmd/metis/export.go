package main

import "github.com/spf13/cobra"

func newExportCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "export",
		Short: "Read export archives",
	}
	cmd.AddCommand(newExportDecryptCommand(), newExportInspectCommand(), newExportRecipientsCommand())
	return modes(cmd, modeServer, modeRemote)
}
