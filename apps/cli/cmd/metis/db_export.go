package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	cerrdefs "github.com/containerd/errdefs"
	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/dbcopy"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

const (
	exportsFolder        = "exports"
	gatewayResendService = "metis-gateway-resend"
	gatewayResendEnvFile = "gateway-resend.env"
)

type dbExportFlags struct {
	keepDown   bool
	s3Endpoint string
	s3Region   string
	keepLocal  bool
	envFile    string
	recipients []string
	out        string
	appURL     string
	dropEnv    []string
	force      bool
	appVersion string
}

func newDBExportCommand() *cobra.Command {
	flags := dbExportFlags{}
	cmd := &cobra.Command{
		Use:   "export",
		Short: "Export to an encrypted archive: this server, or a deployment in maintenance with --env-file",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDBExport(cmd.Context(), flags)
		},
	}
	cmd.Flags().StringVar(&flags.envFile, "env-file", "", "the deployment's environment file (on a server, leave it out to export this server)")
	cmd.Flags().BoolVar(&flags.keepDown, "keep-down", false, "on the server: leave the app in maintenance afterwards, for a move")
	cmd.Flags().StringArrayVar(&flags.recipients, "recipient", nil, "a public key (.pub) to encrypt to (repeatable)")
	cmd.Flags().StringVar(&flags.out, "out", ".", "the folder to write the archive into, or s3://bucket/prefix to upload it")
	cmd.Flags().StringVar(&flags.s3Endpoint, "s3-endpoint", "", "with --out s3://: an S3-compatible endpoint instead of AWS")
	cmd.Flags().StringVar(&flags.s3Region, "s3-region", "", "with --out s3://: the bucket's region (default from the AWS configuration)")
	cmd.Flags().BoolVar(&flags.keepLocal, "keep-local", false, "with --out s3://: keep the local archive after the upload")
	cmd.Flags().StringVar(&flags.appURL, "app-url", "", "the address to check for maintenance (default BETTER_AUTH_URL)")
	cmd.Flags().StringArrayVar(&flags.dropEnv, "drop-env", nil, "a variable to leave out of the archive (repeatable)")
	cmd.Flags().BoolVar(&flags.force, "force", false, "skip the maintenance check, for an app that is already down")
	cmd.Flags().StringVar(&flags.appVersion, "app-version", "", "with --force: the release the app ran")
	return cmd
}

func exportDestination(flags dbExportFlags) (*export.S3Target, error) {
	target, err := export.ParseS3(flags.out)
	if err != nil {
		return nil, err
	}
	if target == nil {
		if flags.s3Endpoint != "" || flags.s3Region != "" || flags.keepLocal {
			return nil, errors.New("--s3-endpoint, --s3-region and --keep-local work only with --out s3://bucket/prefix")
		}
		return nil, nil
	}
	target.Endpoint = flags.s3Endpoint
	target.Region = flags.s3Region
	return target, nil
}

func printExport(result export.Result) {
	where := result.Path
	if where == "" && len(result.Locations) > 0 {
		where = result.Locations[0].Location
	}
	ui.Done("Exported %s (%s) from Metis %s", where, humanSize(result.Size), result.AppVersion)
	shown := where
	if absolute, err := filepath.Abs(where); err == nil && !strings.Contains(where, "://") {
		shown = absolute
	}
	for _, location := range result.Locations {
		if location.Location != where && location.Location != shown {
			ui.Info("Also at %s", location.Location)
		}
	}
	ui.Info("Encrypted to %s", strings.Join(result.Fingerprints, ", "))
	switch {
	case result.Cloud:
		ui.Info("Metis Cloud lists this export in its console, not on the instance's dashboard.")
	case result.RecordError != nil:
		ui.Warn("The export is not listed on the dashboard: recording it failed: %v", result.RecordError)
	case !result.Recorded:
		ui.Info("This release has no export records, so the dashboard does not list it.")
	default:
		ui.Info("Recorded on Dashboard → System → Exports.")
	}
}

func runDBExport(ctx context.Context, flags dbExportFlags) error {
	target, err := exportDestination(flags)
	if err != nil {
		return err
	}
	if flags.envFile == "" && detected.Mode == mode.Server {
		if (flags.out != "." && target == nil) || flags.appURL != "" || len(flags.dropEnv) > 0 || flags.force || flags.appVersion != "" {
			return errors.New("--app-url, --drop-env, --force, --app-version and a local --out work only with --env-file; on the server the export goes to the install's exports folder, or to --out s3://bucket/prefix")
		}
		return runServerExport(ctx, flags.recipients, flags.keepDown, target, flags.keepLocal)
	}
	if flags.keepDown {
		return errors.New("--keep-down works only on the server, without --env-file")
	}
	if flags.envFile == "" {
		return errors.New("pass --env-file FILE: the deployment's environment, with its database URLs and secrets")
	}
	if flags.appVersion != "" && !updater.IsReleaseVersion(strings.TrimPrefix(flags.appVersion, "v")) {
		return fmt.Errorf("--app-version %q is not a release version such as 1.4.0", flags.appVersion)
	}
	recipients, err := readRecipients(flags.recipients)
	if err != nil {
		return err
	}
	env, err := export.ReadEnv(flags.envFile)
	if err != nil {
		return err
	}
	outDir := flags.out
	if target != nil {
		outDir = "."
	}
	result, err := export.Run(ctx, export.Options{
		Env:          env,
		Recipients:   recipients,
		OutDir:       outDir,
		AppURL:       flags.appURL,
		DropEnv:      flags.dropEnv,
		Force:        flags.force,
		AppVersion:   strings.TrimPrefix(flags.appVersion, "v"),
		LocationKind: export.LocationLocal,
		S3:           target,
		KeepLocal:    flags.keepLocal,
		Logf:         func(format string, args ...any) { ui.Faint("  "+format, args...) },
	})
	if err != nil {
		return err
	}
	printExport(result)
	ui.Info("The app stays in maintenance until you remove METIS_MAINTENANCE and redeploy.")
	return nil
}

func exportsDir(dir string) string {
	return filepath.Join(dir, exportsFolder)
}

func requireRoot(command string) error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("on the server, %s changes the install; run it as root: sudo metis %s", command, command)
	}
	return nil
}

func stopContainer(ctx context.Context, stk *stack.Stack, name string) (bool, error) {
	inspect, err := stk.Engine.ContainerInspect(ctx, name, client.ContainerInspectOptions{})
	if cerrdefs.IsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if inspect.Container.State == nil || !inspect.Container.State.Running {
		return false, nil
	}
	if _, err := stk.Engine.ContainerStop(ctx, name, client.ContainerStopOptions{}); err != nil {
		return false, fmt.Errorf("stopping %s: %w", name, err)
	}
	return true, nil
}

func dumpGatewayResend(ctx context.Context, stk *stack.Stack, dir, tmp string) (*archive.Source, error) {
	gatewayEnv, err := envfile.Read(components.EnvFilePath(dir, gatewayResendEnvFile))
	if err != nil {
		return nil, err
	}
	db, err := stackClient(ctx, stk, gatewayEnv.Value("DATABASE_URL"), gatewayEnv.Value("DATABASE_AUTH_TOKEN"))
	if err != nil {
		return nil, fmt.Errorf("the Resend gateway's database: %w", err)
	}
	path := filepath.Join(tmp, "gateway-resend.sqlite")
	if _, err := dbcopy.Dump(ctx, db, path); err != nil {
		return nil, fmt.Errorf("copying the Resend gateway's database: %w", err)
	}
	return &archive.Source{Name: archive.GatewayResend, Path: path}, nil
}

func runServerExport(ctx context.Context, recipientFiles []string, keepDown bool, target *export.S3Target, keepLocal bool) (err error) {
	if err := requireRoot("db export"); err != nil {
		return err
	}
	dir := detected.InstallDir
	st, err := state.Load(dir)
	if err != nil {
		return err
	}
	recipients, err := storedRecipients(st)
	if err != nil {
		return err
	}
	if len(recipientFiles) > 0 {
		if recipients, err = readRecipients(recipientFiles); err != nil {
			return err
		}
	}
	if len(recipients) == 0 {
		return errors.New("this install has no export recipients; add one with sudo metis export recipients add metis-export.pub, or pass --recipient")
	}
	if st.App.Version == "" {
		return errors.New("this install runs images that are not a release, so an export could not name the release to restore it on")
	}
	stk, _, err := serverStack()
	if err != nil {
		return err
	}
	lock, err := state.Acquire(dir)
	if err != nil {
		return err
	}
	defer lock.Release()
	if err := markRunning(lock, state.OperationExport); err != nil {
		return err
	}
	defer clearRunning(lock)
	if err := archive.CleanStale(dir); err != nil {
		return err
	}
	env, err := export.ReadEnv(components.EnvPath(dir))
	if err != nil {
		return err
	}
	app, err := stackClient(ctx, stk, env.Get("DATABASE_URL"), env.Get("DATABASE_AUTH_TOKEN"))
	if err != nil {
		return err
	}
	mastra, err := stackClient(ctx, stk, env.Get("MASTRA_DATABASE_URL"), env.Get("MASTRA_DATABASE_AUTH_TOKEN"))
	if err != nil {
		return err
	}
	if missing := env.Missing(); len(missing) > 0 {
		return fmt.Errorf("%s lacks %s", components.EnvPath(dir), strings.Join(missing, ", "))
	}
	if err := export.CheckEncryptionKey(ctx, app, env.Get("METIS_ENCRYPTION_KEY")); err != nil {
		return err
	}
	if err := os.MkdirAll(exportsDir(dir), 0o700); err != nil {
		return err
	}
	if err := export.CheckSpace(ctx, app, mastra, exportsDir(dir)); err != nil {
		return err
	}

	since := time.Now().UTC().Truncate(time.Second)
	if err := stk.Maintenance(ctx, st, true); err != nil {
		return fmt.Errorf("putting the app in maintenance: %w", err)
	}
	gatewayStopped := false
	defer func() {
		restore := context.WithoutCancel(ctx)
		if keepDown && err == nil {
			return
		}
		if gatewayStopped {
			if _, startErr := stk.Engine.ContainerStart(restore, gatewayResendService, client.ContainerStartOptions{}); startErr != nil {
				ui.Warn("Starting %s again failed: %v. Run sudo metis apply.", gatewayResendService, startErr)
			}
		}
		if offErr := stk.Maintenance(restore, st, false); offErr != nil {
			ui.Warn("Taking the app out of maintenance failed: %v. Run sudo metis apply.", offErr)
		}
	}()

	var extra []archive.Source
	if st.Components.GatewayResend != nil {
		if gatewayStopped, err = stopContainer(ctx, stk, gatewayResendService); err != nil {
			return err
		}
		tmp, err := archive.TempDir(dir)
		if err != nil {
			return err
		}
		defer os.RemoveAll(tmp)
		ui.Faint("  copying the Resend gateway's database (its stored messages are not copied)")
		source, err := dumpGatewayResend(ctx, stk, dir, tmp)
		if err != nil {
			return err
		}
		extra = append(extra, *source)
	}

	result, err := export.Run(ctx, export.Options{
		Env:              env,
		Recipients:       recipients,
		OutDir:           exportsDir(dir),
		AppVersion:       st.App.Version,
		App:              app,
		Mastra:           mastra,
		MaintenanceSince: &since,
		Extra:            extra,
		LocationKind:     export.LocationInstance,
		S3:               target,
		KeepLocal:        keepLocal,
		Logf:             func(format string, args ...any) { ui.Faint("  "+format, args...) },
	})
	if err != nil {
		return err
	}
	printExport(result)
	if result.Path != "" {
		ui.Info("Copy it off this server; an export on the server's own disk does not survive losing that disk.")
	}
	if keepDown {
		ui.Info("The app stays in maintenance (--keep-down). Bring it back with sudo metis apply.")
	}
	return nil
}
