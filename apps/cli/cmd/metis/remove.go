package main

import "github.com/spf13/cobra"

func newRemoveCommand() *cobra.Command {
	cmd := strictGroup(&cobra.Command{
		Use:   "remove",
		Short: "Remove a component",
	})
	cmd.AddCommand(
		newRemoveSqldCommand(),
		newRemoveRedisCommand(),
		newRemoveWorkerCommand(),
		newRemoveObjstoreCommand(),
		newRemoveUpdaterCommand(),
		newRemoveGatewayCloudflareCommand(),
		newRemoveGatewayResendCommand(),
		newRemoveGatewaySESCommand(),
	)
	return modes(cmd, modeServer, modeRemote)
}
