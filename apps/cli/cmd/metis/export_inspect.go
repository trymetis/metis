package main

import (
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func newExportInspectCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "inspect FILE",
		Short: "Show an export's header and check its files, without a key",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			meta, problems, err := archive.Inspect(args[0])
			if err != nil {
				return err
			}
			header := meta.Header
			since := "not recorded (exported with --force)"
			if header.MaintenanceSince != nil {
				since = *header.MaintenanceSince
			}
			ui.Heading("%s", filepath.Base(args[0]))
			ui.Info("  Created           %s", header.CreatedAt)
			ui.Info("  Metis version     %s", header.AppVersion)
			ui.Info("  Last migration    %s", header.Migration)
			ui.Info("  Source            %s", header.Source)
			ui.Info("  Maintenance since %s", since)
			for _, file := range meta.Files {
				ui.Info("  File              %s (%s)", file.Name, humanSize(file.Size))
			}
			for _, recipient := range describeRecipients(meta) {
				ui.Info("  Recipient         %s", recipient)
			}
			if len(problems) > 0 {
				for _, problem := range problems {
					ui.Warn("%s", problem)
				}
				return fmt.Errorf("%s is damaged", args[0])
			}
			ui.Done("All %d files match their checksums", len(meta.Files))
			return nil
		},
	}
}

func describeRecipients(meta *archive.Metadata) []string {
	var out []string
	for _, recipient := range meta.Header.Recipients {
		if recipient.KDF != nil {
			out = append(out, recipient.Fingerprint+" (passphrase)")
		} else {
			out = append(out, recipient.Fingerprint)
		}
	}
	return out
}
