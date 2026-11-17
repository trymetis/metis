package main

import (
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

type addObjstoreFlags struct {
	dataDir string
	direct  bool
	yes     bool
}

func newAddObjstoreCommand() *cobra.Command {
	flags := addObjstoreFlags{}
	cmd := &cobra.Command{
		Use:   "objstore",
		Short: "Run object storage on this server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return addComponent(cmd.Context(), "objstore", flags.yes, components.Options{DataDir: flags.dataDir, Direct: flags.direct})
		},
	}
	cmd.Flags().StringVar(&flags.dataDir, "data-dir", "", "keep the data in this host folder instead of a volume")
	cmd.Flags().BoolVar(&flags.direct, "direct", false, "let browsers transfer files through storage. plus the domain")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return cmd
}
