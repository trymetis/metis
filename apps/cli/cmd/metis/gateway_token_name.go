package main

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newGatewayTokenNameCommand(token *gatewayTokenFlags) *cobra.Command {
	return &cobra.Command{
		Use:   "name ADDRESS NAME",
		Short: "Set the sender name mail from an address carries, or remove it with \"\"",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			address, sender := normalizeGatewayAddress(args[0]), strings.TrimSpace(args[1])
			gateway, err := token.access(address)
			if err != nil {
				return err
			}
			if err := gateways.SetName(cmd.Context(), gateway.Endpoint, gateway.AdminToken, address, sender); err != nil {
				return err
			}
			if sender == "" {
				ui.Done("%s sends with no name", address)
			} else {
				ui.Done("%s sends as %s", address, sender)
			}
			return nil
		},
	}
}
