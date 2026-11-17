package main

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/trymetis/metis/apps/cli/internal/hrana"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/sqld"
	"github.com/trymetis/metis/apps/cli/internal/stack"
	"github.com/trymetis/metis/apps/cli/internal/state"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

const gatewayResendDatabase = "metis-sqld-resend"

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
