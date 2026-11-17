package main

import (
	"fmt"
	"log"
	"os"
)

const usage = `usage: fakes <command>

commands:
  serve       the stand-ins FAKES names (resend, ses, mcp-client, updater, sh, github-raw,
              cloudflare, registry, cron): :443 routed by host name, control on :8080 under
              /NAME/, the SES function URL on :8081, the updater protocol on a Unix socket
  health URL  exits 0 when URL answers 2xx (for scratch healthchecks)
  namespaces ADMIN_URL NAME...
              creates the sqld namespaces through sqld's admin API, then exits
`

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	args := os.Args[2:]
	var err error
	switch os.Args[1] {
	case "serve":
		err = runServe()
	case "health":
		err = runHealth(args)
	case "namespaces":
		err = runNamespaces(args)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		log.Fatalf("[fakes] %s: %v", os.Args[1], err)
	}
}
