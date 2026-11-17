package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"text/tabwriter"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

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
