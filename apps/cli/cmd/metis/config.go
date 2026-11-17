package main

import "github.com/spf13/cobra"

func newConfigCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Change the server's environment and store dashboard settings from it",
	}
	cmd.AddCommand(newConfigSetCommand(), newConfigUnsetCommand())
	return needsRoot(modes(cmd, modeServer, modeRemote))
}
