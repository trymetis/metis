package main

import (
	"context"
	"slices"

	"github.com/trymetis/metis/apps/cli/internal/components"
	"github.com/trymetis/metis/apps/cli/internal/stack"
)

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
