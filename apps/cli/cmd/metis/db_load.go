package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type dbLoadFlags struct {
	identity    identityFlags
	appURL      string
	appToken    string
	mastraURL   string
	mastraToken string
	authURL     string
	writeEnv    string
}

func newDBLoadCommand() *cobra.Command {
	flags := dbLoadFlags{}
	cmd := &cobra.Command{
		Use:   "load FILE",
		Short: "Load an export into two empty databases and print the environment to deploy with",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDBLoad(cmd.Context(), args[0], flags)
		},
	}
	flags.identity.add(cmd)
	cmd.Flags().StringVar(&flags.appURL, "database-url", "", "the empty app database (libsql://, https:// or http://)")
	cmd.Flags().StringVar(&flags.appToken, "database-token", "", "its auth token (required)")
	cmd.Flags().StringVar(&flags.mastraURL, "mastra-url", "", "the empty Mastra database")
	cmd.Flags().StringVar(&flags.mastraToken, "mastra-token", "", "its auth token (required)")
	cmd.Flags().StringVar(&flags.authURL, "app-url", "", "the new deployment's address, when it differs from the exported BETTER_AUTH_URL")
	cmd.Flags().StringVar(&flags.writeEnv, "write-env", "", "write the environment to this file (mode 600) instead of printing it")
	return cmd
}

func runDBLoad(ctx context.Context, path string, flags dbLoadFlags) error {
	if flags.appURL == "" || flags.mastraURL == "" {
		return errors.New("pass --database-url and --mastra-url: two empty databases to load into")
	}
	if flags.writeEnv != "" {
		if _, err := os.Stat(flags.writeEnv); err == nil {
			return fmt.Errorf("%s already exists", flags.writeEnv)
		}
	}
	id, err := flags.identity.read(ctx)
	if err != nil {
		return err
	}
	result, err := export.Load(ctx, export.LoadOptions{
		Archive:     path,
		Identity:    id,
		AppURL:      flags.appURL,
		AppToken:    flags.appToken,
		MastraURL:   flags.mastraURL,
		MastraToken: flags.mastraToken,
		NewAuthURL:  flags.authURL,
		Logf:        func(format string, args ...any) { ui.Faint("  "+format, args...) },
	})
	if err != nil {
		return err
	}
	ui.Done("Loaded both databases")
	lines := strings.Join(result.Env.Lines(), "\n") + "\n"
	if flags.writeEnv != "" {
		if err := writeNew(flags.writeEnv, []byte(lines), 0o600); err != nil {
			return err
		}
		ui.Info("Wrote the environment to %s", flags.writeEnv)
	} else {
		ui.Info("The environment to deploy with:")
		fmt.Print(lines)
	}
	ui.Info("Run the preflight of Metis %s or newer with this environment, then deploy it.", result.AppVersion)
	if result.URLChanged {
		ui.Warn("BETTER_AUTH_URL changes from %s, so register the Google, Microsoft and Zoho redirect URIs again for the new address, and every MCP client must sign in again.", result.PreviousURL)
		ui.Warn("%s", passkeysTiedToAddress)
	}
	return nil
}
