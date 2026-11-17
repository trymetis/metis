package main

import "github.com/spf13/cobra"

func newGatewayCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "gateway",
		Short: "Work with a mail gateway",
	}
	cmd.AddCommand(newGatewayTokenCommand())
	return modes(cmd, modeServer, modeRemote)
}
