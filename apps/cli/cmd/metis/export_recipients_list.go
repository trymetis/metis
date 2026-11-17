package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newExportRecipientsListCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List the export recipients",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			recipients, err := storedRecipients(st)
			if err != nil {
				return err
			}
			if len(recipients) == 0 {
				ui.Info("No export recipients. Add one with sudo metis export recipients add metis-export.pub.")
				return nil
			}
			for _, recipient := range recipients {
				if recipient.KDF != nil {
					ui.Info("%s (passphrase)", keys.Fingerprint(recipient.Key))
				} else {
					ui.Info("%s", keys.Fingerprint(recipient.Key))
				}
			}
			return nil
		},
	}
}
