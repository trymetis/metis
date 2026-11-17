package main

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/secrets"
)

func newSqldAuthCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sqld-auth",
		Short: "Print a new sqld JWT key and the token that goes with it",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			auth, err := secrets.NewSqldAuth()
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "SQLD_AUTH_JWT_KEY=%s\nDATABASE_AUTH_TOKEN=%s\nMASTRA_DATABASE_AUTH_TOKEN=%s\n", auth.JWTKey, auth.Token, auth.Token)
			return err
		},
	}
	return modes(cmd, modeServer, modeRemote)
}
