package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

func runNamespaces(args []string) error {
	if len(args) < 2 {
		return errors.New("namespaces takes sqld's admin URL and at least one namespace")
	}
	env, err := requireEnv("SQLD_ADMIN_KEY")
	if err != nil {
		return err
	}
	admin := strings.TrimRight(args[0], "/")
	client := &http.Client{Timeout: 15 * time.Second}
	for _, name := range args[1:] {
		req, err := http.NewRequest(http.MethodPost,
			fmt.Sprintf("%s/v1/namespaces/%s/create", admin, name), strings.NewReader("{}"))
		if err != nil {
			return err
		}
		req.Header.Set("authorization", "basic "+env["SQLD_ADMIN_KEY"])
		req.Header.Set("content-type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("reaching sqld's admin API at %s: %w", admin, err)
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		_ = res.Body.Close()
		if res.StatusCode != http.StatusOK && !strings.Contains(string(body), "already exists") {
			return fmt.Errorf("creating %s: HTTP %d: %s", name, res.StatusCode, strings.TrimSpace(string(body)))
		}
		log.Printf("[namespaces] %s", name)
	}
	return nil
}
