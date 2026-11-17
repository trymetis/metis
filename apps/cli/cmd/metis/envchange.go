package main

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/moby/moby/api/types/container"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/docker"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

type configFlags struct {
	envFile string
	version string
	yes     bool
}

func (flags *configFlags) add(cmd *cobra.Command) {
	cmd.Flags().StringVar(&flags.envFile, "env-file", "", "away from the server: the deployment's environment file to update")
	cmd.Flags().StringVar(&flags.version, "version", "", "with --env-file: the release the deployment runs, for its preflight image")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
}

func applyConfig(file *envfile.File, set map[string]string, setOrder, unset []string) []string {
	for _, key := range setOrder {
		file.Set(key, set[key])
	}
	for _, key := range unset {
		file.Unset(key)
	}
	return components.InstanceKeysOf(append(slices.Clone(setOrder), unset...))
}

func runConfig(ctx context.Context, flags configFlags, set map[string]string, setOrder, unset []string) error {
	if detected.Mode == mode.Server && flags.envFile == "" {
		if _, ok := set[stack.MaintenanceVariable]; ok {
			ui.Warn("%s goes into .env, so the app stays in maintenance through every metis update, undo and apply until sudo metis config unset %s. Upgrades and undo put the app in maintenance on their own.", stack.MaintenanceVariable, stack.MaintenanceVariable)
		}
		err := change(ctx, flags.yes, nil, func(in *components.Install) error {
			in.Force(applyConfig(in.Env, set, setOrder, unset)...)
			return nil
		})
		if err != nil {
			return err
		}
		ui.Done("Stored in %s and applied", components.EnvPath(detected.InstallDir))
		return nil
	}
	if flags.envFile == "" {
		return errors.New("away from the server, pass --env-file FILE: the deployment's environment, which this command updates")
	}
	return runRemoteConfig(ctx, flags, set, setOrder, unset)
}

func runRemoteConfig(ctx context.Context, flags configFlags, set map[string]string, setOrder, unset []string) error {
	file, err := envfile.Read(flags.envFile)
	if err != nil {
		return err
	}
	forced := applyConfig(file, set, setOrder, unset)
	if err := file.Write(flags.envFile); err != nil {
		return err
	}
	ui.Done("Updated %s", flags.envFile)
	ui.Info("Set these on the platform that runs Metis:")
	for _, key := range setOrder {
		ui.Info("  %s=%s", key, set[key])
	}
	for _, key := range unset {
		ui.Info("  remove %s", key)
	}
	if len(forced) == 0 {
		ui.Info("None of them is a dashboard setting, so the next deploy picks them up.")
		return nil
	}
	release := strings.TrimPrefix(flags.version, "v")
	if !updater.IsReleaseVersion(release) {
		return fmt.Errorf("%s are dashboard settings; pass --version X.Y.Z, the release the deployment runs, to store them once through its preflight image", strings.Join(forced, ", "))
	}
	image := updater.ReleaseImages(release).Preflight
	force := components.ForceKeysVariable + "=" + strings.Join(forced, ",")
	if !docker.Reachable(ctx) {
		ui.Info("")
		ui.Info("Docker is not running here. Store the dashboard settings once with:")
		ui.Info("  docker run --rm --env-file %s -e %s %s", flags.envFile, force, image)
		ui.Warn("Never set %s on the platform itself; every deploy would then overwrite the dashboard.", components.ForceKeysVariable)
		return nil
	}
	engine, err := stack.Connect()
	if err != nil {
		return err
	}
	stk := stack.New(engine, "")
	stk.Logf = func(format string, args ...any) { ui.Faint("  "+format, args...) }
	env := []string{force}
	for _, key := range file.Keys() {
		env = append(env, key+"="+file.Value(key))
	}
	spec := stack.Spec{
		Name:    "metis-preflight-config",
		Service: "preflight",
		OneShot: true,
		Config:  &container.Config{Image: image, Env: env},
		Host:    &container.HostConfig{RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyDisabled}},
	}
	logs, err := stk.RunOnce(ctx, spec)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(strings.TrimSpace(logs), "\n") {
		if strings.Contains(line, "forced sections=") {
			ui.Faint("  %s", line)
		}
	}
	ui.Done("Stored %s in the deployment's database", strings.Join(forced, ", "))
	return nil
}
