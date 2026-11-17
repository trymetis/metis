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
