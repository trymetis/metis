package main

import "github.com/spf13/cobra"

func newConfigSetCommand() *cobra.Command {
	flags := configFlags{}
	cmd := &cobra.Command{
		Use:   "set KEY=VALUE…",
		Short: "Set variables; dashboard settings among them are stored over the dashboard's values",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			values, order, err := parseEnvPairs(args)
			if err != nil {
				return err
			}
			return runConfig(cmd.Context(), flags, values, order, nil)
		},
	}
	flags.add(cmd)
	return cmd
}
