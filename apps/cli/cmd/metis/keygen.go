package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newKeygenCommand() *cobra.Command {
	var out string
	var fromPassphrase bool
	cmd := &cobra.Command{
		Use:   "keygen",
		Short: "Make a key pair for encrypting exports",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if fromPassphrase {
				passphrase, err := askPassphrase(cmd.Context(), true)
				if err != nil {
					return err
				}
				kdf, err := keys.NewKDF()
				if err != nil {
					return err
				}
				ui.Faint("  deriving the key from the passphrase")
				private, err := keys.Derive(passphrase, kdf)
				if err != nil {
					return err
				}
				public, err := keys.MarshalPublic(private.PublicKey(), &kdf)
				if err != nil {
					return err
				}
				if err := writeNew(out+".pub", public, 0o644); err != nil {
					return err
				}
				ui.Done("Wrote %s.pub (fingerprint %s)", out, keys.Fingerprint(private.PublicKey()))
				ui.Info("Open its exports with --passphrase. Anyone with an archive can guess passphrases offline, so use a long one.")
				ui.Warn("Forgetting the passphrase makes every export encrypted only to this key unreadable.")
				return nil
			}
			private, err := keys.Generate()
			if err != nil {
				return err
			}
			privatePEM, err := keys.MarshalPrivate(private)
			if err != nil {
				return err
			}
			publicPEM, err := keys.MarshalPublic(private.PublicKey(), nil)
			if err != nil {
				return err
			}
			if _, err := os.Stat(out + ".pub"); err == nil {
				return fmt.Errorf("%s.pub already exists; pick another name with --out", out)
			}
			if err := writeNew(out+".key", privatePEM, 0o600); err != nil {
				return err
			}
			if err := writeNew(out+".pub", publicPEM, 0o644); err != nil {
				return err
			}
			ui.Done("Wrote %s.key and %s.pub (fingerprint %s)", out, out, keys.Fingerprint(private.PublicKey()))
			ui.Info("Give %s.pub to whatever makes exports. Keep %s.key off the server.", out, out)
			ui.Warn("Losing %s.key makes every export encrypted only to it unreadable.", out)
			return nil
		},
	}
	cmd.Flags().StringVar(&out, "out", "metis-export", "the file name without its extension: NAME.key and NAME.pub")
	cmd.Flags().BoolVar(&fromPassphrase, "from-passphrase", false, "derive the key from a passphrase and write only NAME.pub")
	return modes(cmd, modeServer, modeRemote)
}
