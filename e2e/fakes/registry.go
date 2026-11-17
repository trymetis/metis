package main

import (
	"log"
	"os"

	ggcrregistry "github.com/google/go-containerregistry/pkg/registry"
)

const registryBlobs = "/var/lib/registry"

func newRegistry() (*standIn, error) {
	if err := os.MkdirAll(registryBlobs, 0o755); err != nil {
		return nil, err
	}
	handler := ggcrregistry.New(
		ggcrregistry.WithBlobHandler(ggcrregistry.NewDiskBlobHandler(registryBlobs)),
		ggcrregistry.Logger(log.New(os.Stderr, "[registry] ", 0)),
	)
	return &standIn{
		name:  "registry",
		hosts: []string{"ghcr.io", "registry-1.docker.io", "gcr.io", "registry.localhost", "localhost"},
		ips:   true,
		api:   handler,
	}, nil
}
