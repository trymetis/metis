package main

import "github.com/spf13/cobra"

func newDBCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "db",
		Short: "Export the databases to an encrypted archive, or load one into empty databases",
	}
	cmd.AddCommand(newDBExportCommand(), newDBLoadCommand(), newDBMoveCommand())
	return modes(cmd, modeServer, modeRemote)
}
