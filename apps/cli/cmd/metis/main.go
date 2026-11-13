package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"

	"charm.land/fang/v2"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/version"
)

const (
	modesAnnotation = "modes"
	modeServer      = "server"
	modeRemote      = "remote"
	modeInstall     = "install"
	rootAnnotation  = "root"
)

var detected mode.Detected

func modes(cmd *cobra.Command, list ...string) *cobra.Command {
	if cmd.Annotations == nil {
		cmd.Annotations = map[string]string{}
	}
	cmd.Annotations[modesAnnotation] = strings.Join(list, ",")
	return cmd
}

func needsRoot(cmd *cobra.Command) *cobra.Command {
	if cmd.Annotations == nil {
		cmd.Annotations = map[string]string{}
	}
	cmd.Annotations[rootAnnotation] = "true"
	return cmd
}

func annotation(cmd *cobra.Command, key string) string {
	for current := cmd; current != nil; current = current.Parent() {
		if value, ok := current.Annotations[key]; ok {
			return value
		}
	}
	return ""
}

func checkMode(cmd *cobra.Command) error {
	allowed := strings.Split(annotation(cmd, modesAnnotation), ",")
	if annotation(cmd, modesAnnotation) == "" {
		return nil
	}
	var err error
	if detected, err = mode.Detect(); err != nil {
		return err
	}
	has := func(name string) bool {
		for _, entry := range allowed {
			if entry == name {
				return true
			}
		}
		return false
	}
	switch {
	case has(modeInstall):
		if runtime.GOOS != "linux" {
			return errors.New("a Metis server runs on Linux (amd64 or arm64)")
		}
		if detected.Mode == mode.Server {
			return fmt.Errorf("Metis is already installed in %s; use metis status, metis add and metis update", detected.InstallDir)
		}
	case detected.Mode == mode.Server && !has(modeServer):
		return fmt.Errorf("metis %s runs only away from a server", cmd.Name())
	case detected.Mode == mode.Remote && !has(modeRemote):
		if runtime.GOOS != "linux" {
			return fmt.Errorf("metis %s runs on the Linux server that hosts Metis", cmd.CommandPath())
		}
		return mode.ErrNoInstall
	}
	if annotation(cmd, rootAnnotation) == "true" && (detected.Mode == mode.Server || has(modeInstall)) && os.Geteuid() != 0 {
		return fmt.Errorf("metis %s changes the server; run it as root: sudo %s", cmd.Name(), strings.Join(os.Args, " "))
	}
	return nil
}

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

func newRootCommand() *cobra.Command {
	root := &cobra.Command{
		Use:          "metis",
		Short:        "Install and run a Metis Suite server",
		SilenceUsage: true,
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			return checkMode(cmd)
		},
	}
	root.PersistentFlags().BoolVar(&ui.Accessible, "accessible", false, "ask questions as plain prompts, for screen readers")
	root.AddCommand(
		newSetupCommand(),
		newStatusCommand(),
		newApplyCommand(),
		newAddCommand(),
		newRemoveCommand(),
		newLogsCommand(),
		newRestartCommand(),
		newDomainCommand(),
		newConfigCommand(),
		newConnectCommand(),
		newGatewayCommand(),
		newSqldAuthCommand(),
		newKeygenCommand(),
		newDBCommand(),
		newExportCommand(),
		newUpdateCommand(),
		newUndoCommand(),
		newSelfUpdateCommand(),
		newVersionCommand(),
		newUpdaterCommand(),
	)
	return root
}

func main() {
	log.SetFlags(0)
	if err := fang.Execute(context.Background(), newRootCommand(), fang.WithVersion(version.Version)); err != nil {
		os.Exit(1)
	}
}
