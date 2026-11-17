package main

import "github.com/spf13/cobra"

func newAddCommand() *cobra.Command {
	cmd := strictGroup(&cobra.Command{
		Use:   "add",
		Short: "Add a component, or change one that is already on",
	})
	cmd.AddCommand(
		newAddSqldCommand(),
		newAddRedisCommand(),
		newAddWorkerCommand(),
		newAddObjstoreCommand(),
		newAddUpdaterCommand(),
		newAddGatewayCloudflareCommand(),
		newAddGatewayResendCommand(),
		newAddGatewaySESCommand(),
	)
	return modes(cmd, modeServer, modeRemote)
}
