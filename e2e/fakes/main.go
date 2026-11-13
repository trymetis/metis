package main

import (
	"fmt"
	"log"
	"os"
)

const usage = `usage: fakes <role>

roles:
  updater     the fake updater: the updater protocol on a Unix socket, control on :8080
  resend      the fake Resend API on :443 (api.resend.com), control on :8080
  ses         the fake SESv2 API on :443, control on :8080, a Lambda function URL front on :8081
  mcp-client  Client ID Metadata Documents on :443, hits on :8080
  cron        POSTs the app's workflow tick route every minute
  health URL  exits 0 when URL answers 2xx (for scratch healthchecks)
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
	case "updater":
		err = runUpdater()
	case "resend":
		err = runResend()
	case "ses":
		err = runSes()
	case "mcp-client":
		err = runMcpClient()
	case "cron":
		err = runCron()
	case "health":
		err = runHealth(args)
	default:
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err != nil {
		log.Fatalf("[fakes] %s: %v", os.Args[1], err)
	}
}
