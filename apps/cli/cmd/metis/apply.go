package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newApplyCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "apply",
		Short: "Bring the containers in line with metis.json",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			stk, runner, err := serverStack()
			if err != nil {
				return err
			}
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			plan, err := stk.Plan(ctx, st, stack.Options{})
			if err != nil {
				return err
			}
			if plan.Empty() {
				ui.Done("Everything matches metis.json")
				return nil
			}
			printPlan(plan)
			ok, err := ui.Confirm(ctx, "Apply these changes?", "", yes)
			if err != nil || !ok {
				return err
			}
			_, _, err = runner.Change(ctx, func(*components.Install) error { return nil })
			if err != nil {
				return err
			}
			ui.Done("Applied")
			return nil
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "apply without asking")
	return needsRoot(modes(cmd, modeServer))
}
