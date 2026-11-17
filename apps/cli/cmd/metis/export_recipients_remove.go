package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newExportRecipientsRemoveCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "remove FINGERPRINT",
		Short: "Stop encrypting new exports to a key",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			fingerprint := strings.ToLower(strings.TrimSpace(args[0]))
			_, err := state.Update(detected.InstallDir, func(st *state.State) error {
				kept := st.ExportRecipients[:0]
				found := false
				for _, pem := range st.ExportRecipients {
					public, err := keys.ParsePublic([]byte(pem))
					if err == nil && keys.Fingerprint(public.Key) == fingerprint {
						found = true
						continue
					}
					kept = append(kept, pem)
				}
				if !found {
					return fmt.Errorf("%s is not a recipient; see sudo metis export recipients list", fingerprint)
				}
				st.ExportRecipients = kept
				return nil
			})
			if err != nil {
				return err
			}
			ui.Done("New exports are no longer encrypted to %s; existing archives still open with it", fingerprint)
			return nil
		},
	}
}
