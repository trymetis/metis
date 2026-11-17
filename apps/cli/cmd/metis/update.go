package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/mod/semver"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

func newUpdateCommand() *cobra.Command {
	noBackup := false
	cmd := &cobra.Command{
		Use:   "update [VERSION]",
		Short: "Upgrade to the newest release, or VERSION",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runInProcess(cmd.Context(), func(ctx context.Context, manager *updater.Manager) (*updaterv1.Upgrade, error) {
				target := ""
				if len(args) == 1 {
					target = strings.TrimPrefix(args[0], "v")
				} else {
					status, err := manager.Status(ctx)
					if err != nil {
						return nil, err
					}
					for _, release := range status.GetReleases() {
						if status.GetCurrentVersion() == "" || semver.Compare("v"+release.GetVersion(), "v"+status.GetCurrentVersion()) > 0 {
							target = release.GetVersion()
							break
						}
					}
					if target == "" {
						return nil, fmt.Errorf("%s is the newest release", status.GetCurrentVersion())
					}
				}
				if noBackup {
					ui.Warn("--no-backup takes no database snapshot, so this upgrade cannot be undone")
				}
				return manager.Upgrade(ctx, target, "", updater.UpgradeOptions{NoBackup: noBackup})
			})
		},
	}
	cmd.Flags().BoolVar(&noBackup, "no-backup", false, "skip the database snapshot; the upgrade then has no undo")
	return needsRoot(modes(cmd, modeServer))
}
