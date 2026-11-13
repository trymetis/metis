package main

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/trymetis/metis/apps/cli/internal/catalog"
	"github.com/trymetis/metis/apps/cli/internal/version"
)

func newVersionCommand() *cobra.Command {
	var licenses bool
	cmd := &cobra.Command{
		Use:   "version",
		Short: "Print the CLI version and the images it pins",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			out := cmd.OutOrStdout()
			if licenses {
				_, err := fmt.Fprint(out, version.Licenses)
				return err
			}
			pins, err := catalog.Pins()
			if err != nil {
				return err
			}
			if _, err := fmt.Fprintf(out, "metis %s\n", version.Version); err != nil {
				return err
			}
			for _, pin := range pins {
				if _, err := fmt.Fprintf(out, "  %s\n", pin); err != nil {
					return err
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&licenses, "licenses", false, "print the licenses of the third-party code in this binary")
	return modes(cmd, modeServer, modeRemote)
}
