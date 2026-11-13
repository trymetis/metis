package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/export"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

func humanSize(size int64) string {
	switch {
	case size >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(size)/(1<<30))
	case size >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(size)/(1<<20))
	case size >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(size)/(1<<10))
	}
	return fmt.Sprintf("%d bytes", size)
}

func writeNew(path string, data []byte, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if errors.Is(err, os.ErrExist) {
		return fmt.Errorf("%s already exists; pick another name with --out", path)
	}
	if err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}

func askPassphrase(ctx context.Context, confirm bool) (string, error) {
	if !ui.Interactive() {
		return "", errors.New("the passphrase prompt needs a terminal")
	}
	first, err := ui.Secret(ctx, "Passphrase", "")
	if err != nil {
		return "", err
	}
	if !confirm {
		return first, nil
	}
	again, err := ui.Secret(ctx, "The passphrase again", "")
	if err != nil {
		return "", err
	}
	if first != again {
		return "", errors.New("the two passphrases differ")
	}
	return first, nil
}

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

type identityFlags struct {
	file       string
	passphrase bool
}

func (flags *identityFlags) add(cmd *cobra.Command) {
	cmd.Flags().StringVar(&flags.file, "identity", "", "the private key file (.key) the export was encrypted to")
	cmd.Flags().BoolVar(&flags.passphrase, "passphrase", false, "ask for the passphrase the export was encrypted to")
}

func (flags *identityFlags) read(ctx context.Context) (archive.Identity, error) {
	switch {
	case flags.file != "" && flags.passphrase:
		return archive.Identity{}, errors.New("pass --identity or --passphrase, not both")
	case flags.file != "":
		data, err := os.ReadFile(flags.file)
		if err != nil {
			return archive.Identity{}, err
		}
		private, err := keys.ParsePrivate(data)
		if err != nil {
			return archive.Identity{}, fmt.Errorf("%s: %w", flags.file, err)
		}
		return archive.Identity{Key: private}, nil
	case flags.passphrase:
		passphrase, err := askPassphrase(ctx, false)
		if err != nil {
			return archive.Identity{}, err
		}
		return archive.Identity{Passphrase: passphrase}, nil
	}
	return archive.Identity{}, errors.New("pass --identity KEY or --passphrase")
}

func readRecipients(paths []string) ([]*keys.Public, error) {
	if len(paths) == 0 {
		return nil, errors.New("pass at least one --recipient FILE: a public key from metis keygen or openssl")
	}
	var out []*keys.Public
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		public, err := keys.ParsePublic(data)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		out = append(out, public)
	}
	return out, nil
}

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

type dbLoadFlags struct {
	identity    identityFlags
	appURL      string
	appToken    string
	mastraURL   string
	mastraToken string
	authURL     string
	writeEnv    string
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
	}
	return nil
}

func newDBCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "db",
		Short: "Export the databases to an encrypted archive, or load one into empty databases",
	}
	exportFlags := dbExportFlags{}
	exportCmd := &cobra.Command{
		Use:   "export",
		Short: "Export to an encrypted archive: this server, or a deployment in maintenance with --env-file",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDBExport(cmd.Context(), exportFlags)
		},
	}
	exportCmd.Flags().StringVar(&exportFlags.envFile, "env-file", "", "the deployment's environment file (on a server, leave it out to export this server)")
	exportCmd.Flags().BoolVar(&exportFlags.keepDown, "keep-down", false, "on the server: leave the app in maintenance afterwards, for a move")
	exportCmd.Flags().StringArrayVar(&exportFlags.recipients, "recipient", nil, "a public key (.pub) to encrypt to (repeatable)")
	exportCmd.Flags().StringVar(&exportFlags.out, "out", ".", "the folder to write the archive into, or s3://bucket/prefix to upload it")
	exportCmd.Flags().StringVar(&exportFlags.s3Endpoint, "s3-endpoint", "", "with --out s3://: an S3-compatible endpoint instead of AWS")
	exportCmd.Flags().StringVar(&exportFlags.s3Region, "s3-region", "", "with --out s3://: the bucket's region (default from the AWS configuration)")
	exportCmd.Flags().BoolVar(&exportFlags.keepLocal, "keep-local", false, "with --out s3://: keep the local archive after the upload")
	exportCmd.Flags().StringVar(&exportFlags.appURL, "app-url", "", "the address to check for maintenance (default BETTER_AUTH_URL)")
	exportCmd.Flags().StringArrayVar(&exportFlags.dropEnv, "drop-env", nil, "a variable to leave out of the archive (repeatable)")
	exportCmd.Flags().BoolVar(&exportFlags.force, "force", false, "skip the maintenance check, for an app that is already down")
	exportCmd.Flags().StringVar(&exportFlags.appVersion, "app-version", "", "with --force: the release the app ran")

	loadFlags := dbLoadFlags{}
	loadCmd := &cobra.Command{
		Use:   "load FILE",
		Short: "Load an export into two empty databases and print the environment to deploy with",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDBLoad(cmd.Context(), args[0], loadFlags)
		},
	}
	loadFlags.identity.add(loadCmd)
	loadCmd.Flags().StringVar(&loadFlags.appURL, "database-url", "", "the empty app database (libsql://, https:// or http://)")
	loadCmd.Flags().StringVar(&loadFlags.appToken, "database-token", "", "its auth token (required)")
	loadCmd.Flags().StringVar(&loadFlags.mastraURL, "mastra-url", "", "the empty Mastra database")
	loadCmd.Flags().StringVar(&loadFlags.mastraToken, "mastra-token", "", "its auth token (required)")
	loadCmd.Flags().StringVar(&loadFlags.authURL, "app-url", "", "the new deployment's address, when it differs from the exported BETTER_AUTH_URL")
	loadCmd.Flags().StringVar(&loadFlags.writeEnv, "write-env", "", "write the environment to this file (mode 600) instead of printing it")
	moveFlags := dbMoveFlags{}
	moveCmd := &cobra.Command{
		Use:   "move",
		Short: "Move this server's databases to two empty libSQL databases and run on them",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDBMove(cmd.Context(), moveFlags)
		},
	}
	moveCmd.Flags().StringVar(&moveFlags.appURL, "to", "", "the empty app database (libsql:// for Turso, http(s):// for sqld)")
	moveCmd.Flags().StringVar(&moveFlags.appToken, "token", "", "its token (required)")
	moveCmd.Flags().StringVar(&moveFlags.mastraURL, "mastra-url", "", "the empty Mastra database, the same kind")
	moveCmd.Flags().StringVar(&moveFlags.mastraToken, "mastra-token", "", "its token (required)")
	moveCmd.Flags().BoolVar(&moveFlags.yes, "yes", false, "go ahead without asking")
	cmd.AddCommand(exportCmd, loadCmd, needsRoot(modes(moveCmd, modeServer)))
	return modes(cmd, modeServer, modeRemote)
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

func newExportCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "export",
		Short: "Read export archives",
	}
	decryptFlags := identityFlags{}
	var out string
	decrypt := &cobra.Command{
		Use:   "decrypt FILE",
		Short: "Decrypt an export into plain SQLite files and boot.env",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			id, err := decryptFlags.read(cmd.Context())
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
	decryptFlags.add(decrypt)
	decrypt.Flags().StringVar(&out, "out", ".", "the folder to write into")

	inspect := &cobra.Command{
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
	cmd.AddCommand(decrypt, inspect, newExportRecipientsCommand())
	return modes(cmd, modeServer, modeRemote)
}
