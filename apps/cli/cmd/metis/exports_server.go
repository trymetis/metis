package main

import (
	"context"
	"errors"
	"fmt"
	"net/url"
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
	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/sqld"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

const (
	exportsFolder         = "exports"
	gatewayResendDatabase = "metis-sqld-resend"
	gatewayResendService  = "metis-gateway-resend"
	gatewayResendEnvFile  = "gateway-resend.env"
)

var stackDatabaseHosts = map[string]string{
	"app.sqld":    sqld.Container,
	"mastra.sqld": sqld.Container,
	"resend.sqld": sqld.Container,
	"sqld-resend": gatewayResendDatabase,
}

func stackClient(ctx context.Context, stk *stack.Stack, raw, token string) (*hrana.Client, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("%q is not a database URL", raw)
	}
	container, ok := stackDatabaseHosts[parsed.Hostname()]
	if !ok {
		return hrana.New(raw, token)
	}
	addr, err := stk.PublishedPort(ctx, container, "8080/tcp")
	if err != nil {
		return nil, fmt.Errorf("reaching %s: %w", container, err)
	}
	db, err := hrana.New("http://"+addr, token)
	if err != nil {
		return nil, err
	}
	return db.WithHost(parsed.Host), nil
}

func exportsDir(dir string) string {
	return filepath.Join(dir, exportsFolder)
}

func storedRecipients(st *state.State) ([]*keys.Public, error) {
	var out []*keys.Public
	for _, pem := range st.ExportRecipients {
		public, err := keys.ParsePublic([]byte(pem))
		if err != nil {
			return nil, fmt.Errorf("metis.json holds an export recipient that does not parse: %w", err)
		}
		out = append(out, public)
	}
	return out, nil
}

func markRunning(lock *state.Lock, kind string) error {
	_, err := lock.Update(func(st *state.State) error {
		st.Running = &state.Operation{Kind: kind, StartedAt: time.Now().UTC().Format(time.RFC3339Nano)}
		return nil
	})
	return err
}

func clearRunning(lock *state.Lock) {
	if _, err := lock.Update(func(st *state.State) error {
		st.Running = nil
		return nil
	}); err != nil {
		ui.Warn("Clearing the running mark in metis.json failed: %v", err)
	}
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

func requireRoot(command string) error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("on the server, %s changes the install; run it as root: sudo metis %s", command, command)
	}
	return nil
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

func newExportRecipientsCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "recipients",
		Short: "Manage the public keys this server's exports are encrypted to",
	}
	add := &cobra.Command{
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
	list := &cobra.Command{
		Use:   "list",
		Short: "List the export recipients",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			recipients, err := storedRecipients(st)
			if err != nil {
				return err
			}
			if len(recipients) == 0 {
				ui.Info("No export recipients. Add one with sudo metis export recipients add metis-export.pub.")
				return nil
			}
			for _, recipient := range recipients {
				if recipient.KDF != nil {
					ui.Info("%s (passphrase)", keys.Fingerprint(recipient.Key))
				} else {
					ui.Info("%s", keys.Fingerprint(recipient.Key))
				}
			}
			return nil
		},
	}
	remove := &cobra.Command{
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
	cmd.AddCommand(add, list, remove)
	return needsRoot(modes(cmd, modeServer))
}

type dbMoveFlags struct {
	appURL      string
	appToken    string
	mastraURL   string
	mastraToken string
	yes         bool
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
