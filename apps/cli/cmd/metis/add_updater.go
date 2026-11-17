package main

import (
	"errors"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

type addUpdaterFlags struct {
	systemd bool
	docker  bool
	yes     bool
}

func newAddUpdaterCommand() *cobra.Command {
	flags := addUpdaterFlags{}
	cmd := &cobra.Command{
		Use:   "updater",
		Short: "Run the updater, or switch how it runs",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			opts := components.Options{}
			switch {
			case flags.systemd && flags.docker:
				return errors.New("pass --systemd or --docker, not both")
			case flags.systemd:
				opts.UpdaterMode = state.UpdaterSystemd
			case flags.docker:
				opts.UpdaterMode = state.UpdaterDocker
			}
			return addComponent(cmd.Context(), "updater", flags.yes, opts)
		},
	}
	cmd.Flags().BoolVar(&flags.systemd, "systemd", false, "run it as a systemd service (the default when systemd runs)")
	cmd.Flags().BoolVar(&flags.docker, "docker", false, "run it as a container")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}
