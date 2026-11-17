package main

import "github.com/spf13/cobra"

func newUpdaterCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:    "updater",
		Short:  "The updater daemon",
		Hidden: true,
	}
	cmd.AddCommand(newUpdaterServeCommand())
	return cmd
}
