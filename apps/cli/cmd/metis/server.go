package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"sort"
	"strings"
	"sync"
	"text/tabwriter"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/cloudflare"
	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func printPlan(plan stack.Plan) {
	for _, name := range plan.Create {
		ui.Info("  + create   %s", name)
	}
	for _, name := range plan.Recreate {
		ui.Info("  ~ recreate %s", name)
	}
	for _, name := range plan.Remove {
		ui.Info("  - remove   %s", name)
	}
	if plan.Preflight {
		ui.Info("  > run preflight")
	}
}

func newApplyCommand() *cobra.Command {
	yes := false
	cmd := &cobra.Command{
		Use:   "apply",
		Short: "Bring the containers in line with metis.json",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			stk, runner, err := serverStack()
			if err != nil {
				return err
			}
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			plan, err := stk.Plan(ctx, st, stack.Options{})
			if err != nil {
				return err
			}
			if plan.Empty() {
				ui.Done("Everything matches metis.json")
				return nil
			}
			printPlan(plan)
			ok, err := ui.Confirm(ctx, "Apply these changes?", "", yes)
			if err != nil || !ok {
				return err
			}
			_, _, err = runner.Change(ctx, func(*components.Install) error { return nil })
			if err != nil {
				return err
			}
			ui.Done("Applied")
			return nil
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "apply without asking")
	return needsRoot(modes(cmd, modeServer))
}

func change(ctx context.Context, yes bool, warning func(in *components.Install) string, mutate func(in *components.Install) error) error {
	_, runner, err := serverStack()
	if err != nil {
		return err
	}
	if warning != nil {
		st, err := state.Load(detected.InstallDir)
		if err != nil {
			return err
		}
		in, err := components.NewInstall(detected.InstallDir, st)
		if err != nil {
			return err
		}
		if text := warning(in); text != "" {
			ui.Warn("%s", text)
			ok, err := ui.Confirm(ctx, "Go ahead?", "", yes)
			if err != nil {
				return err
			}
			if !ok {
				return errors.New("nothing changed")
			}
		}
	}
	in, plan, err := runner.Change(ctx, mutate)
	if in != nil {
		for _, notice := range in.Notices {
			ui.Info("%s", notice)
		}
	}
	if err != nil {
		return err
	}
	printPlan(plan)
	return nil
}

func newDomainCommand() *cobra.Command {
	remove, yes := false, false
	cmd := &cobra.Command{
		Use:   "domain HOST",
		Short: "Serve Metis on a domain with HTTPS, or stop with --remove",
		Args: func(cmd *cobra.Command, args []string) error {
			if remove {
				return cobra.NoArgs(cmd, args)
			}
			return cobra.ExactArgs(1)(cmd, args)
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			caddy, _ := components.Get("caddy")
			if remove {
				if err := change(cmd.Context(), yes, nil, func(in *components.Install) error {
					return caddy.Remove(cmd.Context(), in, components.Options{})
				}); err != nil {
					return err
				}
				ui.Done("Metis is reachable on 127.0.0.1 only")
				return nil
			}
			host := strings.ToLower(strings.TrimSuffix(args[0], "."))
			if err := validHost(host); err != nil {
				return err
			}
			if err := change(cmd.Context(), yes, nil, func(in *components.Install) error {
				return caddy.Add(cmd.Context(), in, components.Options{Domain: host})
			}); err != nil {
				return err
			}
			if ip, err := cloudflare.PublicIPv4(cmd.Context()); err == nil {
				if err := components.PublishRecords(cmd.Context(), host, []cloudflare.Record{{Type: "A", Name: host, Value: ip}}); err != nil {
					ui.Warn("%v", err)
				}
			}
			ui.Done("Metis is served on https://%s once its DNS points at this server", host)
			return nil
		},
	}
	cmd.Flags().BoolVar(&remove, "remove", false, "stop serving the domain")
	cmd.Flags().BoolVar(&yes, "yes", false, "go ahead without asking")
	return needsRoot(modes(cmd, modeServer))
}

type containerStatus struct {
	Name      string `json:"name"`
	Component string `json:"component"`
	State     string `json:"state"`
	Health    string `json:"health,omitempty"`
}

type componentStatus struct {
	Name    string `json:"name"`
	Detail  string `json:"detail"`
	Healthy bool   `json:"healthy"`
}

type statusReport struct {
	Version    string            `json:"version"`
	Updater    string            `json:"updater"`
	Last       json.RawMessage   `json:"lastUpgrade"`
	Components []componentStatus `json:"components"`
	Containers []containerStatus `json:"containers"`
}

func collectStatus(ctx context.Context) (statusReport, error) {
	st, err := state.Load(detected.InstallDir)
	if err != nil {
		return statusReport{}, err
	}
	stk, _, err := serverStack()
	if err != nil {
		return statusReport{}, err
	}
	managed, err := stk.Managed(ctx)
	if err != nil {
		return statusReport{}, err
	}
	report := statusReport{Version: st.App.Version, Updater: "off", Last: st.Updater.Last}
	if st.Components.Updater != nil {
		report.Updater = string(st.Components.Updater.Mode)
	}
	names := make([]string, 0, len(managed))
	for name := range managed {
		names = append(names, name)
	}
	sort.Strings(names)
	byComponent := map[string][]containerStatus{}
	for _, name := range names {
		summary := managed[name]
		entry := containerStatus{Name: name, Component: summary.Labels[stack.LabelComponent], State: string(summary.State)}
		if inspect, err := stk.Engine.ContainerInspect(ctx, name, client.ContainerInspectOptions{}); err == nil && inspect.Container.State != nil && inspect.Container.State.Health != nil {
			entry.Health = string(inspect.Container.State.Health.Status)
		}
		report.Containers = append(report.Containers, entry)
		byComponent[entry.Component] = append(byComponent[entry.Component], entry)
	}
	healthy := func(list []containerStatus) bool {
		if len(list) == 0 {
			return false
		}
		for _, entry := range list {
			if entry.State != string(container.StateRunning) || (entry.Health != "" && entry.Health != string(container.Healthy)) {
				return false
			}
		}
		return true
	}
	report.Components = append(report.Components, componentStatus{Name: "app", Detail: st.App.Version, Healthy: healthy(byComponent["app"])})
	for _, component := range components.All() {
		detail, on := component.Status(ctx, st)
		if !on {
			continue
		}
		ok := healthy(byComponent[component.Name()])
		if component.Name() == "updater" && st.Components.Updater.Mode == state.UpdaterSystemd {
			ok = components.UnitState(ctx) == "active"
		}
		report.Components = append(report.Components, componentStatus{Name: component.Name(), Detail: detail, Healthy: ok})
	}
	return report, nil
}

func newStatusCommand() *cobra.Command {
	asJSON := false
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show the components, containers and the last upgrade",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			report, err := collectStatus(cmd.Context())
			if err != nil {
				return err
			}
			if asJSON {
				encoder := json.NewEncoder(cmd.OutOrStdout())
				encoder.SetIndent("", "  ")
				return encoder.Encode(report)
			}
			ui.Heading("Metis %s", report.Version)
			table := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
			for _, component := range report.Components {
				mark := "ok"
				if !component.Healthy {
					mark = "NOT HEALTHY"
				}
				fmt.Fprintf(table, "%s\t%s\t%s\n", component.Name, mark, component.Detail)
			}
			_ = table.Flush()
			ui.Info("")
			table = tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
			for _, entry := range report.Containers {
				fmt.Fprintf(table, "%s\t%s\t%s\n", entry.Name, entry.State, entry.Health)
			}
			_ = table.Flush()
			var last struct {
				Kind        string `json:"kind"`
				FromVersion string `json:"fromVersion"`
				ToVersion   string `json:"toVersion"`
				State       string `json:"state"`
				Step        string `json:"step"`
				Error       string `json:"error"`
			}
			if json.Unmarshal(report.Last, &last) == nil && last.State != "" {
				ui.Info("")
				ui.Info("Last %s: %s → %s, %s", strings.ToLower(strings.TrimPrefix(last.Kind, "UPGRADE_KIND_")), last.FromVersion, last.ToVersion, strings.ToLower(strings.TrimPrefix(last.State, "UPGRADE_STATE_")))
				if last.Error != "" {
					ui.Info("  %s", last.Error)
				}
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "print JSON")
	return modes(cmd, modeServer)
}

func componentContainers(ctx context.Context, stk *stack.Stack, component string) ([]string, error) {
	if _, err := components.Get(component); err != nil && component != "app" {
		return nil, err
	}
	managed, err := stk.Managed(ctx)
	if err != nil {
		return nil, err
	}
	var names []string
	for name, summary := range managed {
		if summary.Labels[stack.LabelComponent] == component && name != stack.ContainerName("preflight", 1) {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	return names, nil
}

type prefixWriter struct {
	mu     *sync.Mutex
	out    io.Writer
	prefix string
}

func (writer prefixWriter) Write(data []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		if _, err := fmt.Fprintf(writer.out, "%s%s\n", writer.prefix, scanner.Text()); err != nil {
			return 0, err
		}
	}
	return len(data), nil
}

func newLogsCommand() *cobra.Command {
	follow, tail := false, "100"
	cmd := &cobra.Command{
		Use:   "logs COMPONENT",
		Short: "Show a component's container logs (app, sqld, worker, …)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			stk, _, err := serverStack()
			if err != nil {
				return err
			}
			names, err := componentContainers(ctx, stk, args[0])
			if err != nil {
				return err
			}
			if len(names) == 0 {
				if args[0] == "updater" {
					return errors.New("the updater runs under systemd: journalctl -u " + components.UnitName)
				}
				return fmt.Errorf("%s has no containers", args[0])
			}
			var mu sync.Mutex
			var group sync.WaitGroup
			errs := make(chan error, len(names))
			for _, name := range names {
				prefix := ""
				if len(names) > 1 {
					prefix = strings.TrimPrefix(name, "metis-") + " | "
				}
				writer := prefixWriter{mu: &mu, out: cmd.OutOrStdout(), prefix: prefix}
				group.Go(func() {
					reader, err := stk.Engine.ContainerLogs(ctx, name, client.ContainerLogsOptions{ShowStdout: true, ShowStderr: true, Follow: follow, Tail: tail})
					if err != nil {
						errs <- err
						return
					}
					defer reader.Close()
					if _, err := stdcopy.StdCopy(writer, writer, reader); err != nil && !errors.Is(err, context.Canceled) {
						errs <- err
					}
				})
			}
			group.Wait()
			close(errs)
			return <-errs
		},
	}
	cmd.Flags().BoolVarP(&follow, "follow", "f", false, "keep printing new lines")
	cmd.Flags().StringVar(&tail, "tail", "100", "how many lines to start from, or all")
	return modes(cmd, modeServer)
}

func newRestartCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "restart COMPONENT",
		Short: "Restart a component's containers",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			st, err := state.Load(detected.InstallDir)
			if err != nil {
				return err
			}
			if args[0] == "updater" && st.Components.Updater != nil && st.Components.Updater.Mode == state.UpdaterSystemd {
				if err := components.RestartUnit(ctx); err != nil {
					return err
				}
				ui.Done("Restarted %s", components.UnitName)
				return nil
			}
			stk, _, err := serverStack()
			if err != nil {
				return err
			}
			names, err := componentContainers(ctx, stk, args[0])
			if err != nil {
				return err
			}
			if len(names) == 0 {
				return fmt.Errorf("%s has no containers", args[0])
			}
			for _, name := range names {
				if _, err := stk.Engine.ContainerRestart(ctx, name, client.ContainerRestartOptions{}); err != nil {
					return err
				}
				if err := stk.Wait(ctx, name); err != nil {
					return err
				}
				ui.Done("Restarted %s", name)
			}
			return nil
		},
	}
	return needsRoot(modes(cmd, modeServer))
}
