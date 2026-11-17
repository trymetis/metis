package main

import (
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newExportDecryptCommand() *cobra.Command {
	identity := identityFlags{}
	var out string
	cmd := &cobra.Command{
		Use:   "decrypt FILE",
		Short: "Decrypt an export into plain SQLite files and boot.env",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id, err := identity.read(cmd.Context())
			if err != nil {
				return err
			}
			if err := os.MkdirAll(out, 0o700); err != nil {
				return err
			}
			written, err := archive.Extract(args[0], id, out)
			if err != nil {
				return err
			}
			for _, name := range []string{archive.App, archive.Mastra, archive.BootEnv, archive.GatewayResend} {
				if path, ok := written[name]; ok {
					ui.Done("Wrote %s", filepath.Clean(path))
				}
			}
			ui.Warn("These files are not encrypted; boot.env holds the instance's secrets.")
			return nil
		},
	}
	identity.add(cmd)
	cmd.Flags().StringVar(&out, "out", ".", "the folder to write into")
	return cmd
}
