package main

import "github.com/spf13/cobra"

func newDomainCommand() *cobra.Command {
	cmd := strictGroup(&cobra.Command{
		Use:   "domain",
		Short: "Serve Metis on a domain with HTTPS, or stop serving it",
	})
	cmd.AddCommand(newDomainSetCommand(), newDomainRemoveCommand())
	return needsRoot(modes(cmd, modeServer))
}

const passkeysTiedToAddress = "Passkeys belong to the address users open, so a new address stops every user's passkeys working: users sign in with their authenticator app or a backup code, add new passkeys, then remove the old ones."
