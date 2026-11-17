package main

import (
	"fmt"

	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newRestartCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "restart COMPONENT",
		Short: "Restart a component's containers",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			if args[0] == "updater" && st.Components.Updater != nil && st.Components.Updater.Mode == state.UpdaterSystemd {
				if err := components.RestartUnit(ctx); err != nil {
					return err
				}
				ui.Done("Restarted %s", components.UnitName)
				return nil
			}
			stk, _, err := serverStack()
			if err != nil {
				return err
			}
			names, err := componentContainers(ctx, stk, args[0])
			if err != nil {
				return err
			}
			if len(names) == 0 {
				return fmt.Errorf("%s has no containers", args[0])
			}
			for _, name := range names {
				if _, err := stk.Engine.ContainerRestart(ctx, name, client.ContainerRestartOptions{}); err != nil {
					return err
				}
				if err := stk.Wait(ctx, name); err != nil {
					return err
				}
				ui.Done("Restarted %s", name)
			}
			return nil
		},
	}
	return needsRoot(modes(cmd, modeServer))
}
