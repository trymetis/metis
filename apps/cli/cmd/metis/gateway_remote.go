package main

import (
	"errors"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/gateways"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

func remoteGatewayDomain(raw string) (string, error) {
	domain := gateways.NormalizeDomain(raw)
	if domain == "" {
		return "", errors.New("pass --domain")
	}
	return domain, nil
}

func printRemoteGateway(name, domain, endpoint, apiToken string) {
	ui.Info("")
	ui.Info("The gateway's admin token (API_TOKEN), shown once; metis gateway token needs it:")
	ui.Info("  %s", apiToken)
	components.PrintEntry(components.ServerKey(name), components.GatewayEntry(name, domain, endpoint))
}

func printRemoteGatewayRemoved(name, domain string) {
	ui.Info("Remove the server %s from Dashboard → System, or drop it from %s.", components.ServerID(name, domain), components.ServerKey(name))
}
