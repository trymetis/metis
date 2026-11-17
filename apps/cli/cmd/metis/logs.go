package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/components"
)

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
