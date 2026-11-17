package main

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/mode"
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

func strictGroup(cmd *cobra.Command) *cobra.Command {
	cmd.Args = cobra.NoArgs
	cmd.RunE = func(cmd *cobra.Command, _ []string) error { return cmd.Help() }
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
			return fmt.Errorf("%s runs on the Linux server that hosts Metis", cmd.CommandPath())
		}
		return mode.ErrNoInstall
	}
	if annotation(cmd, rootAnnotation) == "true" && (detected.Mode == mode.Server || has(modeInstall)) && os.Geteuid() != 0 {
		return fmt.Errorf("%s changes the server; run it as root: sudo %s", cmd.CommandPath(), strings.Join(os.Args, " "))
	}
	return nil
}
