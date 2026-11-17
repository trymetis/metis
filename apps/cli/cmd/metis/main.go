package main

import (
	"context"
	"log"
	"os"

	"charm.land/fang/v2"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

func main() {
	log.SetFlags(0)
	if err := fang.Execute(
		context.Background(),
		newRootCommand(),
		fang.WithVersion(version.Version),
		fang.WithErrorHandler(printError),
	); err != nil {
		os.Exit(1)
	}
}
