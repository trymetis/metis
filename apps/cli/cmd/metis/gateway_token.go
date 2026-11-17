package main

import (
	"errors"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

type gatewayTokenFlags struct {
	endpoint   string
	adminToken string
}

func newGatewayTokenCommand() *cobra.Command {
	flags := &gatewayTokenFlags{}
	cmd := strictGroup(&cobra.Command{
		Use:   "token",
		Short: "Mint, list, name or revoke mailbox tokens on the gateway that serves an address",
	})
	cmd.PersistentFlags().StringVar(&flags.endpoint, "endpoint", "", "away from the server: the gateway's URL")
	cmd.PersistentFlags().StringVar(&flags.adminToken, "admin-token", "", "away from the server: the gateway's API_TOKEN")
	cmd.AddCommand(
		newGatewayTokenCreateCommand(flags),
		newGatewayTokenNameCommand(flags),
		newGatewayTokenListCommand(flags),
		newGatewayTokenRevokeCommand(flags),
	)
	return cmd
}

func normalizeGatewayAddress(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func (flags *gatewayTokenFlags) access(target string) (components.GatewayAccess, error) {
	if flags.endpoint != "" {
		if flags.adminToken == "" {
			return components.GatewayAccess{}, errors.New("pass --admin-token, the gateway's API_TOKEN")
		}
		return components.GatewayAccess{Endpoint: flags.endpoint, AdminToken: flags.adminToken}, nil
	}
	if detected.Mode != mode.Server {
		return components.GatewayAccess{}, errors.New("away from the server, pass --endpoint and --admin-token")
	}
	st, err := state.Load(detected.InstallDir)
	if err != nil {
		return components.GatewayAccess{}, err
	}
	in, err := components.NewInstall(detected.InstallDir, st)
	if err != nil {
		return components.GatewayAccess{}, err
	}
	domain := target
	if _, after, ok := strings.Cut(target, "@"); ok {
		domain = after
	}
	return components.FindGateway(in, domain)
}
