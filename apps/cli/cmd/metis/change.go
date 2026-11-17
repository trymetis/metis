package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func serverStack(dirs ...string) (*stack.Stack, *components.Runner, error) {
	dir := detected.InstallDir
	if len(dirs) > 0 {
		dir = dirs[0]
	}
	engine, err := stack.Connect()
	if err != nil {
		return nil, nil, err
	}
	stk := stack.New(engine, dir)
	stk.Logf = func(format string, args ...any) {
		ui.Faint("  "+format, args...)
	}
	return stk, &components.Runner{Dir: dir, Stack: stk}, nil
}

func printPlan(plan stack.Plan) {
	for _, name := range plan.Create {
		ui.Info("  + create   %s", name)
	}
	for _, name := range plan.Recreate {
		ui.Info("  ~ recreate %s", name)
	}
	for _, name := range plan.Start {
		ui.Info("  ^ start    %s", name)
	}
	for _, name := range plan.Remove {
		ui.Info("  - remove   %s", name)
	}
	if plan.Preflight {
		ui.Info("  > run preflight")
	}
	if plan.Site {
		ui.Info("  > take the site out of maintenance")
	}
}

func change(ctx context.Context, yes bool, warning func(in *components.Install) string, mutate func(in *components.Install) error) error {
	_, runner, err := serverStack()
	if err != nil {
		return err
	}
	if warning != nil {
		st, err := state.Load(detected.InstallDir)
		if err != nil {
			return err
		}
		in, err := components.NewInstall(detected.InstallDir, st)
		if err != nil {
			return err
		}
		if text := warning(in); text != "" {
			ui.Warn("%s", text)
			ok, err := ui.Confirm(ctx, "Go ahead?", "", yes)
			if err != nil {
				return err
			}
			if !ok {
				return errors.New("nothing changed")
			}
		}
	}
	in, plan, err := runner.Change(ctx, mutate)
	if in != nil {
		for _, notice := range in.Notices {
			ui.Info("%s", notice)
		}
	}
	if err != nil {
		return err
	}
	printPlan(plan)
	return nil
}

func addComponent(ctx context.Context, name string, yes bool, opts components.Options) error {
	component, err := components.Get(name)
	if err != nil {
		return err
	}
	if detected.Mode != mode.Server {
		return mode.ErrNoInstall
	}
	if os.Geteuid() != 0 {
		return errors.New("metis add changes the server; run it with sudo")
	}
	err = change(ctx, yes,
		func(in *components.Install) string { return component.Warning(in, true) },
		func(in *components.Install) error {
			return components.AddWithRequirements(ctx, in, component, opts)
		})
	if err != nil {
		return err
	}
	ui.Done("%s is on", component.Name())
	return nil
}

func removeComponent(ctx context.Context, name string, yes bool, opts components.Options) error {
	component, err := components.Get(name)
	if err != nil {
		return err
	}
	if detected.Mode != mode.Server {
		return mode.ErrNoInstall
	}
	if os.Geteuid() != 0 {
		return errors.New("metis remove changes the server; run it with sudo")
	}
	err = change(ctx, yes,
		func(in *components.Install) string { return component.Warning(in, false) },
		func(in *components.Install) error {
			if _, on := component.Status(ctx, in.State); !on {
				return fmt.Errorf("%s is not on", component.Name())
			}
			return component.Remove(ctx, in, opts)
		})
	if err != nil {
		return err
	}
	ui.Done("%s is off", component.Name())
	return nil
}
