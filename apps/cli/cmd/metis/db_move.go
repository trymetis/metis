package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/dbcopy"
	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type dbMoveFlags struct {
	appURL      string
	appToken    string
	mastraURL   string
	mastraToken string
	yes         bool
}

func newDBMoveCommand() *cobra.Command {
	flags := dbMoveFlags{}
	cmd := &cobra.Command{
		Use:   "move",
		Short: "Move this server's databases to two empty libSQL databases and run on them",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDBMove(cmd.Context(), flags)
		},
	}
	cmd.Flags().StringVar(&flags.appURL, "to", "", "the empty app database (libsql:// for Turso, http(s):// for sqld)")
	cmd.Flags().StringVar(&flags.appToken, "token", "", "its token (required)")
	cmd.Flags().StringVar(&flags.mastraURL, "mastra-url", "", "the empty Mastra database, the same kind")
	cmd.Flags().StringVar(&flags.mastraToken, "mastra-token", "", "its token (required)")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "go ahead without asking")
	return needsRoot(modes(cmd, modeServer))
}

func runDBMove(ctx context.Context, flags dbMoveFlags) (err error) {
	driver, err := export.CheckTargets(export.TargetFlags{AppURL: "--to", AppToken: "--token", MastraURL: "--mastra-url", MastraToken: "--mastra-token"}, flags.appURL, flags.appToken, flags.mastraURL, flags.mastraToken)
	if err != nil {
		return err
	}
	dir := detected.InstallDir
	ok, err := ui.Confirm(ctx, "Move both databases?", fmt.Sprintf("The app goes into maintenance, both databases are copied to %s and %s, and the app comes back on them. The current databases are left as they are.", flags.appURL, flags.mastraURL), flags.yes)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("nothing changed")
	}
	stk, _, err := serverStack()
	if err != nil {
		return err
	}
	st, err := state.Load(dir)
	if err != nil {
		return err
	}
	targetApp, err := hrana.New(flags.appURL, flags.appToken)
	if err != nil {
		return err
	}
	targetMastra, err := hrana.New(flags.mastraURL, flags.mastraToken)
	if err != nil {
		return err
	}
	if err := dbcopy.Empty(ctx, targetApp); err != nil {
		return fmt.Errorf("--to: %w", err)
	}
	if err := dbcopy.Empty(ctx, targetMastra); err != nil {
		return fmt.Errorf("--mastra-url: %w", err)
	}
	env, err := export.ReadEnv(components.EnvPath(dir))
	if err != nil {
		return err
	}
	sourceApp, err := stackClient(ctx, stk, env.Get("DATABASE_URL"), env.Get("DATABASE_AUTH_TOKEN"))
	if err != nil {
		return err
	}
	sourceMastra, err := stackClient(ctx, stk, env.Get("MASTRA_DATABASE_URL"), env.Get("MASTRA_DATABASE_AUTH_TOKEN"))
	if err != nil {
		return err
	}

	if err := copyToTargets(ctx, stk, st, dir, [2]*hrana.Client{sourceApp, sourceMastra}, [2]*hrana.Client{targetApp, targetMastra}); err != nil {
		return err
	}
	ui.Done("Copied both databases")
	err = change(ctx, true, nil, func(in *components.Install) error {
		in.Env.Set("METIS_DB_DRIVER", driver)
		in.Env.Set("DATABASE_URL", flags.appURL)
		in.Env.Set("DATABASE_AUTH_TOKEN", flags.appToken)
		in.Env.Set("MASTRA_DATABASE_URL", flags.mastraURL)
		in.Env.Set("MASTRA_DATABASE_AUTH_TOKEN", flags.mastraToken)
		return nil
	})
	if err != nil {
		return fmt.Errorf("%w\n.env already names the new databases; fix the cause, then run sudo metis apply", err)
	}
	ui.Done("Metis runs on the new databases")
	if st.Components.Sqld != nil {
		if resend := st.Components.GatewayResend; resend != nil && resend.Database == "stack" {
			ui.Info("sqld keeps the old copy and still serves the Resend gateway.")
		} else {
			ui.Info("sqld keeps the old copy. Once you are sure, remove it with sudo metis remove sqld --purge.")
		}
	}
	return nil
}

func copyToTargets(ctx context.Context, stk *stack.Stack, st *state.State, dir string, sources, targets [2]*hrana.Client) (err error) {
	lock, err := state.Acquire(dir)
	if err != nil {
		return err
	}
	defer lock.Release()
	if err := markRunning(lock, state.OperationMove); err != nil {
		return err
	}
	defer clearRunning(lock)
	if err := archive.CleanStale(dir); err != nil {
		return err
	}
	if err := stk.Maintenance(ctx, st, true); err != nil {
		return fmt.Errorf("putting the app in maintenance: %w", err)
	}
	defer func() {
		if err != nil {
			if offErr := stk.Maintenance(context.WithoutCancel(ctx), st, false); offErr != nil {
				ui.Warn("Taking the app out of maintenance failed: %v. Run sudo metis apply.", offErr)
			}
		}
	}()
	tmp, err := archive.TempDir(dir)
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	for index, name := range []string{"app", "mastra"} {
		file := filepath.Join(tmp, name+".sqlite")
		ui.Faint("  copying the %s database", name)
		if _, err := dbcopy.Dump(ctx, sources[index], file); err != nil {
			return fmt.Errorf("copying the %s database: %w", name, err)
		}
		if _, err := dbcopy.Load(ctx, file, targets[index]); err != nil {
			return fmt.Errorf("loading the %s database: %w", name, err)
		}
	}
	return nil
}
