package main

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/gateways"
)

func newGatewayTokenListCommand(token *gatewayTokenFlags) *cobra.Command {
	return &cobra.Command{
		Use:   "list DOMAIN",
		Short: "List the addresses that have a mailbox token, with their sender names",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			gateway, err := token.access(normalizeGatewayAddress(args[0]))
			if err != nil {
				return err
			}
			tokens, err := gateways.ListTokens(cmd.Context(), gateway.Endpoint, gateway.AdminToken)
			if err != nil {
				return err
			}
			for _, entry := range tokens {
				if _, err := fmt.Fprintln(cmd.OutOrStdout(), string(entry)); err != nil {
					return err
				}
			}
			return nil
		},
	}
}
