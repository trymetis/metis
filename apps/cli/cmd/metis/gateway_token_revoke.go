package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newGatewayTokenRevokeCommand(token *gatewayTokenFlags) *cobra.Command {
	return &cobra.Command{
		Use:   "revoke ADDRESS",
		Short: "Revoke an address's mailbox token",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			address := normalizeGatewayAddress(args[0])
			gateway, err := token.access(address)
			if err != nil {
				return err
			}
			if err := gateways.RevokeToken(cmd.Context(), gateway.Endpoint, gateway.AdminToken, address); err != nil {
				return err
			}
			ui.Done("Revoked the token for %s", address)
			return nil
		},
	}
}
