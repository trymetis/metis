package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newGatewayTokenCreateCommand(token *gatewayTokenFlags) *cobra.Command {
	var name string
	cmd := &cobra.Command{
		Use:   "create ADDRESS",
		Short: "Mint a mailbox token for an address",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			address := normalizeGatewayAddress(args[0])
			if !strings.Contains(address, "@") {
				return errors.New("create needs an address such as alice@example.com")
			}
			gateway, err := token.access(address)
			if err != nil {
				return err
			}
			created, err := gateways.CreateToken(cmd.Context(), gateway.Endpoint, gateway.AdminToken, address, name)
			if err != nil {
				return err
			}
			ui.Info("Token for %s (shown once; paste it when connecting the mailbox):", address)
			_, err = fmt.Fprintln(cmd.OutOrStdout(), created)
			return err
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "the sender name mail from the address carries")
	return cmd
}
