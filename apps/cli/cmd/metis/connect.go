package main

import "github.com/spf13/cobra"

func newConnectCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "connect",
		Short: "Set up a sign-in provider",
	}
	cmd.AddCommand(newConnectGoogleCommand())
	return modes(cmd, modeServer, modeRemote)
}
