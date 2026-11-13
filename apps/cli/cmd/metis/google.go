package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"charm.land/huh/v2"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/envfile"
	"github.com/trymetis/metis/apps/cli/internal/google"
	"github.com/trymetis/metis/apps/cli/internal/mode"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type googleFlags struct {
	clientID     string
	clientSecret string
	project      string
	config       configFlags
}

func authURL(flags googleFlags) (string, error) {
	path := flags.config.envFile
	if detected.Mode == mode.Server && path == "" {
		path = components.EnvPath(detected.InstallDir)
	}
	if path == "" {
		return "", errors.New("away from the server, pass --env-file FILE: the deployment's environment, with BETTER_AUTH_URL")
	}
	file, err := envfile.Read(path)
	if err != nil {
		return "", err
	}
	url := strings.TrimRight(file.Value("BETTER_AUTH_URL"), "/")
	if url == "" {
		return "", fmt.Errorf("%s sets no BETTER_AUTH_URL", path)
	}
	return url, nil
}

func googleProject(ctx context.Context, project string) (string, error) {
	token, signedIn := google.GcloudToken(ctx)
	if !signedIn {
		ui.Info("Create a Google Cloud project, or pick one: https://console.cloud.google.com/projectcreate")
		ui.Info("Then turn on these APIs in it: %s", strings.Join(google.APIs, ", "))
		for _, api := range google.APIs {
			ui.Info("  https://console.cloud.google.com/apis/library/%s", api)
		}
		if project == "" {
			if err := ui.Run(ctx, huh.NewGroup(huh.NewInput().Title("Project ID").Value(&project).Validate(func(value string) error {
				if strings.TrimSpace(value) == "" {
					return errors.New("enter the project ID")
				}
				return nil
			}))); err != nil {
				return "", err
			}
		}
		return strings.TrimSpace(project), nil
	}
	api := google.NewAPI(token)
	if project == "" && ui.Interactive() {
		if err := ui.Run(ctx, huh.NewGroup(huh.NewInput().Title("Project ID").Description("gcloud is signed in. Leave this blank to create a new project.").Value(&project))); err != nil {
			return "", err
		}
	}
	project = strings.TrimSpace(project)
	if project == "" {
		project = google.NewProjectID()
		if err := api.CreateProject(ctx, project); err != nil {
			return "", err
		}
		ui.Done("Created the project %s", project)
	}
	if err := api.EnableAPIs(ctx, project); err != nil {
		return "", err
	}
	ui.Done("Turned on the Gmail, Calendar, Drive and People APIs")
	return project, nil
}

func googleGuide(ctx context.Context, project, redirect string, clientID, secret *string) error {
	note := func(title, description string) *huh.Group {
		return huh.NewGroup(huh.NewNote().Title(title).Description(description))
	}
	return ui.Run(ctx,
		note("1. Branding", "Open "+google.ConsoleURL("auth/branding", project)+"\nSet the app name (Metis) and a support email."),
		note("2. Audience", "Open "+google.ConsoleURL("auth/audience", project)+"\n\nWith Google Workspace, choose Internal: only your organisation's members can connect, and Gmail and Drive scopes may need your Workspace admin's approval.\n\nOtherwise choose External, then Publish app. People then see Google's \"unverified app\" screen before they consent, and the project can sign up at most 100 new users over its lifetime. Leave Testing alone: its tokens expire after 7 days."),
		note("3. Data access", "Open "+google.ConsoleURL("auth/scopes", project)+"\nAdd these scopes:\n"+strings.Join(google.Scopes, "\n")),
		note("4. Client", "Open "+google.ConsoleURL("auth/clients/create", project)+"\nChoose Web application and add this authorised redirect URI:\n"+redirect),
		huh.NewGroup(
			huh.NewInput().Title("Client ID").Value(clientID).Validate(func(value string) error {
				if !strings.HasSuffix(strings.TrimSpace(value), google.ClientIDSuffix) {
					return fmt.Errorf("a client ID ends in %s", google.ClientIDSuffix)
				}
				return nil
			}),
			huh.NewInput().Title("Client secret").EchoMode(huh.EchoModePassword).Value(secret),
		),
	)
}

func connectGoogle(ctx context.Context, flags googleFlags) error {
	auth, err := authURL(flags)
	if err != nil {
		return err
	}
	redirect := google.RedirectURI(auth)
	clientID, secret := strings.TrimSpace(flags.clientID), strings.TrimSpace(flags.clientSecret)
	if clientID == "" || secret == "" {
		if !ui.Interactive() {
			return errors.New("without a terminal, pass --client-id and --client-secret")
		}
		project, err := googleProject(ctx, flags.project)
		if err != nil {
			return err
		}
		if err := googleGuide(ctx, project, redirect, &clientID, &secret); err != nil {
			return err
		}
		clientID, secret = strings.TrimSpace(clientID), strings.TrimSpace(secret)
	}
	if err := google.CheckClient(ctx, clientID, secret, redirect); err != nil {
		return err
	}
	ui.Done("Google accepts the client")
	values := map[string]string{"GOOGLE_CLIENT_ID": clientID, "GOOGLE_CLIENT_SECRET": secret}
	return runConfig(ctx, flags.config, values, []string{"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}, nil)
}

func newConnectCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "connect",
		Short: "Set up a sign-in provider",
	}
	flags := googleFlags{}
	googleCmd := &cobra.Command{
		Use:   "google",
		Short: "Create the Google OAuth client and store it",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return connectGoogle(cmd.Context(), flags)
		},
	}
	googleCmd.Flags().StringVar(&flags.clientID, "client-id", "", "an existing client ID, skipping the guided steps")
	googleCmd.Flags().StringVar(&flags.clientSecret, "client-secret", "", "the secret for --client-id")
	googleCmd.Flags().StringVar(&flags.project, "project", "", "the Google Cloud project to use")
	googleCmd.Flags().StringVar(&flags.config.envFile, "env-file", "", "away from the server: the deployment's environment file")
	googleCmd.Flags().StringVar(&flags.config.version, "version", "", "with --env-file: the release the deployment runs")
	googleCmd.Flags().BoolVar(&flags.config.yes, "yes", false, "go ahead without asking")
	cmd.AddCommand(googleCmd)
	return modes(cmd, modeServer, modeRemote)
}
