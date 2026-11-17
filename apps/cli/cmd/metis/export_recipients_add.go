package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newExportRecipientsAddCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "add FILE",
		Short: "Encrypt this server's exports to a public key (.pub)",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			data, err := os.ReadFile(args[0])
			if err != nil {
				return err
			}
			public, err := keys.ParsePublic(data)
			if err != nil {
				return fmt.Errorf("%s: %w", args[0], err)
			}
			fingerprint := keys.Fingerprint(public.Key)
			_, err = state.Update(detected.InstallDir, func(st *state.State) error {
				existing, err := storedRecipients(st)
				if err != nil {
					return err
				}
				for _, recipient := range existing {
					if keys.Fingerprint(recipient.Key) == fingerprint {
						return fmt.Errorf("%s is already a recipient", fingerprint)
					}
				}
				st.ExportRecipients = append(st.ExportRecipients, string(data))
				return nil
			})
			if err != nil {
				return err
			}
			ui.Done("Exports are encrypted to %s", fingerprint)
			return nil
		},
	}
}
