package main

import "github.com/spf13/cobra"

func newConfigUnsetCommand() *cobra.Command {
	flags := configFlags{}
	cmd := &cobra.Command{
		Use:   "unset KEY…",
		Short: "Remove variables; dashboard settings among them return to their defaults",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runConfig(cmd.Context(), flags, map[string]string{}, nil, args)
		},
	}
	flags.add(cmd)
	return cmd
}
