package main

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var hostPattern = regexp.MustCompile(`^(?i)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

func validHost(value string) error {
	if value == "" || hostPattern.MatchString(value) {
		return nil
	}
	return errors.New("enter a hostname such as mail.example.com, without https://")
}

func parseEnvPairs(pairs []string) (map[string]string, []string, error) {
	values := map[string]string{}
	var order []string
	for _, pair := range pairs {
		key, value, ok := strings.Cut(pair, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, nil, fmt.Errorf("%q is not KEY=VALUE", pair)
		}
		if _, seen := values[key]; !seen {
			order = append(order, key)
		}
		values[key] = value
	}
	return values, order, nil
}
