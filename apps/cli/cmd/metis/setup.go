package main

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"charm.land/huh/v2"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/docker"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/secrets"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
	"github.com/trymetis/metis/apps/cli/internal/updater"
)

const encryptionWarning = "Back up METIS_ENCRYPTION_KEY from %s; losing it means reconnecting every mailbox, calendar, drive and address book."

var (
	hostPattern  = regexp.MustCompile(`^(?i)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)
	setupOptions = []string{"updater", "worker", "objstore"}
)

type setupFlags struct {
	dir            string
	domain         string
	ownerEmail     string
	databaseURL    string
	databaseToken  string
	with           []string
	version        string
	appPort        int
	env            []string
	envFile        string
	yes            bool
	databaseRemote bool
	gateways       []string
	googleNow      bool
}

func validEmail(value string) error {
	address, err := mail.ParseAddress(strings.TrimSpace(value))
	if err != nil || address.Address != strings.TrimSpace(value) {
		return errors.New("enter an email address such as you@example.com")
	}
	return nil
}

func validHost(value string) error {
	if value == "" || hostPattern.MatchString(value) {
		return nil
	}
	return errors.New("enter a hostname such as mail.example.com, without https://")
}

func parseEnvPairs(pairs []string) (map[string]string, []string, error) {
	values := map[string]string{}
	var order []string
	for _, pair := range pairs {
		key, value, ok := strings.Cut(pair, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, nil, fmt.Errorf("%q is not KEY=VALUE", pair)
		}
		if _, seen := values[key]; !seen {
			order = append(order, key)
		}
		values[key] = value
	}
	return values, order, nil
}

func setupForm(ctx context.Context, flags *setupFlags, mastraURL, mastraToken *string) error {
	database := "sqld"
	if flags.databaseURL != "" {
		database = "remote"
	}
	selected := slices.Clone(flags.with)
	options := []huh.Option[string]{
		huh.NewOption("Updater: upgrade from Dashboard → Updates", "updater").Selected(slices.Contains(selected, "updater")),
		huh.NewOption("Workers with Redis: run workflows outside the app", "worker").Selected(slices.Contains(selected, "worker")),
		huh.NewOption("Object storage: a drive on this server", "objstore").Selected(slices.Contains(selected, "objstore")),
		huh.NewOption("Cloudflare Email gateway", "gateway-cloudflare"),
		huh.NewOption("Resend gateway (needs a domain)", "gateway-resend"),
		huh.NewOption("Amazon SES gateway", "gateway-ses"),
	}
	googleChoice := "later"
	err := ui.Run(ctx,
		huh.NewGroup(
			huh.NewInput().Title("Domain").Description("The hostname people open, such as mail.example.com. Leave it blank to reach Metis only through an SSH tunnel for now.").Value(&flags.domain).Validate(validHost),
			huh.NewInput().Title("Owner email").Description("The instance owner; the setup page accepts only this address.").Value(&flags.ownerEmail).Validate(validEmail),
		),
		huh.NewGroup(
			huh.NewSelect[string]().Title("Database").Options(
				huh.NewOption("sqld on this server", "sqld"),
				huh.NewOption("A libSQL database elsewhere (Turso or your own sqld)", "remote"),
			).Value(&database),
		),
		huh.NewGroup(
			huh.NewInput().Title("App database URL").Description("libsql:// for Turso, http(s):// for sqld").Value(&flags.databaseURL).Validate(requiredDatabaseURL),
			huh.NewInput().Title("App database token").EchoMode(huh.EchoModePassword).Value(&flags.databaseToken),
			huh.NewInput().Title("Agent memory database URL").Description("A second database the AI agents keep their memory in").Value(mastraURL).Validate(requiredDatabaseURL),
			huh.NewInput().Title("Agent memory database token").EchoMode(huh.EchoModePassword).Value(mastraToken),
		).WithHideFunc(func() bool { return database != "remote" }),
		huh.NewGroup(
			huh.NewMultiSelect[string]().Title("Components").Description("Add or remove any of them later with metis add and metis remove. Gateways are set up once Metis runs.").Options(options...).Value(&selected),
		),
		huh.NewGroup(
			huh.NewSelect[string]().Title("Google sign-in").Description("Lets people connect Gmail, Google Calendar, Drive and Contacts.").Options(
				huh.NewOption("Later, with metis connect google", "later"),
				huh.NewOption("Now, once Metis runs", "now"),
			).Value(&googleChoice),
		),
	)
	if err != nil {
		return err
	}
	flags.with = nil
	flags.gateways = nil
	for _, name := range selected {
		if components.IsGateway(name) {
			flags.gateways = append(flags.gateways, name)
		} else {
			flags.with = append(flags.with, name)
		}
	}
	flags.googleNow = googleChoice == "now"
	flags.databaseRemote = database == "remote"
	return nil
}

func requiredDatabaseURL(value string) error {
	if driverFor(value) == "" {
		return errors.New("enter a libsql://, http(s):// or ws(s):// URL")
	}
	return nil
}

func driverFor(url string) string {
	switch {
	case strings.HasPrefix(url, "libsql://"):
		return "turso"
	case regexp.MustCompile(`^(https?|wss?)://`).MatchString(url):
		return "sqld"
	}
	return ""
}

func emptyDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(entries) > 0 {
		return fmt.Errorf("%s is not empty; setup installs only into an empty folder", dir)
	}
	return nil
}

func pinRelease(ctx context.Context, exact string) (updater.Meta, error) {
	if exact == "" {
		return updater.NewestCompatible(ctx)
	}
	exact = strings.TrimPrefix(exact, "v")
	meta, found, err := updater.FetchMeta(ctx, exact)
	if err != nil {
		return updater.Meta{}, err
	}
	if !found {
		return updater.Meta{}, fmt.Errorf("%s is not a published release with a %s", exact, updater.MetaURL(exact))
	}
	if !updater.CLISatisfies(meta.MinCli) {
		return updater.Meta{}, fmt.Errorf("%s needs Metis CLI %s or later; run sudo metis self-update, then setup again", exact, meta.MinCli)
	}
	return meta, nil
}

func runSetup(ctx context.Context, flags *setupFlags) error {
	dir := filepath.Clean(flags.dir)
	if !filepath.IsAbs(dir) {
		return fmt.Errorf("--dir %s is not an absolute path", flags.dir)
	}
	if err := emptyDir(dir); err != nil {
		return err
	}
	extra, extraOrder, err := parseEnvPairs(flags.env)
	if err != nil {
		return err
	}
	if flags.envFile != "" {
		file, err := envfile.Read(flags.envFile)
		if err != nil {
			return err
		}
		for _, key := range file.Keys() {
			if _, set := extra[key]; !set {
				extraOrder = append(extraOrder, key)
			}
			extra[key] = file.Value(key)
		}
	}
	mastraURL, mastraToken := extra["MASTRA_DATABASE_URL"], extra["MASTRA_DATABASE_AUTH_TOKEN"]
	flags.databaseRemote = flags.databaseURL != ""

	if ui.Interactive() && !flags.yes {
		if err := setupForm(ctx, flags, &mastraURL, &mastraToken); err != nil {
			return err
		}
	}
	var missing []string
	if validEmail(flags.ownerEmail) != nil {
		missing = append(missing, "--owner-email you@example.com")
	}
	if flags.databaseRemote && (driverFor(flags.databaseURL) == "" || driverFor(flags.databaseURL) != driverFor(mastraURL)) {
		missing = append(missing, "--database-url, --database-token and --env MASTRA_DATABASE_URL=… --env MASTRA_DATABASE_AUTH_TOKEN=… (both libsql:// or both http(s)://)")
	}
	if err := validHost(flags.domain); err != nil {
		missing = append(missing, "--domain mail.example.com")
	}
	for _, name := range flags.with {
		if components.IsGateway(name) {
			missing = append(missing, fmt.Sprintf("a running install for %s: add it after setup with metis add %s", name, name))
		} else if !slices.Contains(setupOptions, name) {
			missing = append(missing, fmt.Sprintf("--with takes %s, not %s", strings.Join(setupOptions, ","), name))
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("setup needs %s", strings.Join(missing, "; "))
	}

	if ui.Interactive() && !flags.yes {
		summary := []string{"Install folder: " + dir, "Owner: " + flags.ownerEmail}
		if flags.domain != "" {
			summary = append(summary, "Domain: "+flags.domain+" (Caddy with HTTPS)")
		} else {
			summary = append(summary, "Domain: none, 127.0.0.1:"+strconv.Itoa(flags.appPort)+" only")
		}
		if flags.databaseRemote {
			summary = append(summary, "Database: "+flags.databaseURL)
		} else {
			summary = append(summary, "Database: sqld on this server")
		}
		if len(flags.with) > 0 {
			summary = append(summary, "Components: "+strings.Join(flags.with, ", "))
		}
		ok, err := ui.Confirm(ctx, "Install Metis?", strings.Join(summary, "\n"), false)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("setup cancelled")
		}
	}
	ui.Heading("Installing Metis in %s", dir)
	if err := docker.Ensure(ctx); err != nil {
		return err
	}
	ui.Done("Docker Engine answers")
	meta, err := pinRelease(ctx, flags.version)
	if err != nil {
		return err
	}
	ui.Done("Using Metis %s", meta.Version)

	st := state.New()
	st.AppPort = flags.appPort
	images := updater.ReleaseImages(meta.Version)
	st.App = state.App{Version: meta.Version, Images: state.Images{App: images.App, Preflight: images.Preflight, Worker: images.Worker}}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	in, err := components.NewInstall(dir, st)
	if err != nil {
		return err
	}
	env := in.Env
	env.Set("METIS_OWNER_EMAIL", strings.TrimSpace(flags.ownerEmail))
	env.Set("BETTER_AUTH_URL", "http://localhost:"+strconv.Itoa(flags.appPort))
	env.Set("BETTER_AUTH_SECRET", secrets.Token())
	env.Set("METIS_ENCRYPTION_KEY", secrets.EncryptionKey())
	env.Set("METIS_DRIVE_RELAY_SECRET", secrets.Token())
	env.Set("METIS_SETUP_CODE", secrets.Token())
	if flags.databaseRemote {
		env.Set("METIS_DB_DRIVER", driverFor(flags.databaseURL))
		env.Set("DATABASE_URL", flags.databaseURL)
		env.Set("DATABASE_AUTH_TOKEN", flags.databaseToken)
		env.Set("MASTRA_DATABASE_URL", mastraURL)
		env.Set("MASTRA_DATABASE_AUTH_TOKEN", mastraToken)
	} else if err := components.AddWithRequirements(ctx, in, mustComponent("sqld"), components.Options{}); err != nil {
		return err
	}
	if flags.domain != "" {
		if err := components.AddWithRequirements(ctx, in, mustComponent("caddy"), components.Options{Domain: flags.domain}); err != nil {
			return err
		}
	}
	for _, name := range setupOptions {
		if slices.Contains(flags.with, name) {
			if err := components.AddWithRequirements(ctx, in, mustComponent(name), components.Options{}); err != nil {
				return err
			}
		}
	}
	for _, key := range extraOrder {
		env.Set(key, extra[key])
	}
	in.Forced = nil

	_, runner, err := serverStack(dir)
	if err != nil {
		return err
	}
	if err := mode.Record(dir); err != nil {
		return err
	}
	if _, err := runner.First(ctx, in); err != nil {
		return fmt.Errorf("%w\nFix the cause, then run sudo metis apply", err)
	}
	for _, notice := range in.Notices {
		ui.Info("%s", notice)
	}
	url := env.Value("BETTER_AUTH_URL")
	ui.Done("Metis is running")
	ui.Info("")
	if flags.domain != "" {
		ui.Info("Open %s/setup once DNS for %s points at this server.", url, flags.domain)
	} else {
		ui.Info("Metis listens on 127.0.0.1:%d. Reach it with ssh -L %d:127.0.0.1:%d, then open %s/setup,", flags.appPort, flags.appPort, flags.appPort, url)
		ui.Info("or give it a domain with sudo metis domain mail.example.com.")
	}
	ui.Info("Setup code: %s", env.Value("METIS_SETUP_CODE"))
	ui.Warn(encryptionWarning, components.EnvPath(dir))
	detected = mode.Detected{Mode: mode.Server, InstallDir: dir}
	for _, name := range flags.gateways {
		ui.Info("")
		ui.Heading("Setting up %s", name)
		if err := setupGateway(ctx, name); err != nil {
			ui.Warn("%s was not set up: %v. Run sudo metis add %s later.", name, err, name)
		}
	}
	if flags.googleNow {
		ui.Info("")
		ui.Heading("Connecting Google")
		if err := connectGoogle(ctx, googleFlags{}); err != nil {
			ui.Warn("Google was not connected: %v. Run sudo metis connect google later.", err)
		}
	}
	return nil
}

func setupGateway(ctx context.Context, name string) error {
	component, err := components.Get(name)
	if err != nil {
		return err
	}
	opts := components.Options{}
	fields := []huh.Field{huh.NewInput().Title("Mail domain").Description("The domain the addresses are on, such as example.com").Value(&opts.Domain).Validate(validHost)}
	if name == "gateway-ses" {
		fields = append(fields,
			huh.NewInput().Title("SES region").Description("An SES receiving region, such as eu-west-1").Value(&opts.Region),
			huh.NewInput().Title("Database URL").Description("A libSQL database Lambda can reach, such as Turso").Value(&opts.DatabaseURL),
			huh.NewInput().Title("Database token").EchoMode(huh.EchoModePassword).Value(&opts.DatabaseToken),
		)
	}
	if err := ui.Run(ctx, huh.NewGroup(fields...)); err != nil {
		return err
	}
	return change(ctx, false,
		func(in *components.Install) string { return component.Warning(in, true) },
		func(in *components.Install) error { return components.AddWithRequirements(ctx, in, component, opts) })
}

func mustComponent(name string) components.Component {
	component, err := components.Get(name)
	if err != nil {
		panic(err)
	}
	return component
}

func newSetupCommand() *cobra.Command {
	flags := &setupFlags{}
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Install Metis on this server",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSetup(cmd.Context(), flags)
		},
	}
	cmd.Flags().StringVar(&flags.dir, "dir", mode.DefaultInstallDir, "the install folder; it must be empty")
	cmd.Flags().StringVar(&flags.domain, "domain", "", "the hostname people open, such as mail.example.com")
	cmd.Flags().StringVar(&flags.ownerEmail, "owner-email", "", "the instance owner's email address")
	cmd.Flags().StringVar(&flags.databaseURL, "database-url", "", "a libSQL URL to use instead of sqld on this server")
	cmd.Flags().StringVar(&flags.databaseToken, "database-token", "", "the token for --database-url")
	cmd.Flags().StringSliceVar(&flags.with, "with", []string{"updater"}, "components to add: updater, worker, objstore")
	cmd.Flags().StringVar(&flags.version, "version", "", "install this release instead of the newest one this CLI supports")
	cmd.Flags().IntVar(&flags.appPort, "app-port", state.DefaultPort, "the port on 127.0.0.1 the app listens on")
	cmd.Flags().StringArrayVar(&flags.env, "env", nil, "an extra KEY=VALUE for .env (repeatable)")
	cmd.Flags().StringVar(&flags.envFile, "env-file", "", "a file of extra KEY=VALUE lines for .env")
	cmd.Flags().BoolVar(&flags.yes, "yes", false, "skip the questions and use the flags")
	return needsRoot(modes(cmd, modeInstall))
}
