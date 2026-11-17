package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/trymetis/metis/apps/cli/internal/archive"
	"github.com/trymetis/metis/apps/cli/internal/keys"
	"github.com/trymetis/metis/apps/cli/internal/ui"
)

type identityFlags struct {
	file       string
	passphrase bool
}

func (flags *identityFlags) add(cmd *cobra.Command) {
	cmd.Flags().StringVar(&flags.file, "identity", "", "the private key file (.key) the export was encrypted to")
	cmd.Flags().BoolVar(&flags.passphrase, "passphrase", false, "ask for the passphrase the export was encrypted to")
}

func (flags *identityFlags) read(ctx context.Context) (archive.Identity, error) {
	switch {
	case flags.file != "" && flags.passphrase:
		return archive.Identity{}, errors.New("pass --identity or --passphrase, not both")
	case flags.file != "":
		data, err := os.ReadFile(flags.file)
		if err != nil {
			return archive.Identity{}, err
		}
		private, err := keys.ParsePrivate(data)
		if err != nil {
			return archive.Identity{}, fmt.Errorf("%s: %w", flags.file, err)
		}
		return archive.Identity{Key: private}, nil
	case flags.passphrase:
		passphrase, err := askPassphrase(ctx, false)
		if err != nil {
			return archive.Identity{}, err
		}
		return archive.Identity{Passphrase: passphrase}, nil
	}
	return archive.Identity{}, errors.New("pass --identity KEY or --passphrase")
}

func askPassphrase(ctx context.Context, confirm bool) (string, error) {
	if !ui.Interactive() {
		return "", errors.New("the passphrase prompt needs a terminal")
	}
	first, err := ui.Secret(ctx, "Passphrase", "")
	if err != nil {
		return "", err
	}
	if !confirm {
		return first, nil
	}
	again, err := ui.Secret(ctx, "The passphrase again", "")
	if err != nil {
		return "", err
	}
	if first != again {
		return "", errors.New("the two passphrases differ")
	}
	return first, nil
}

func readRecipients(paths []string) ([]*keys.Public, error) {
	if len(paths) == 0 {
		return nil, errors.New("pass at least one --recipient FILE: a public key from metis keygen or openssl")
	}
	var out []*keys.Public
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		public, err := keys.ParsePublic(data)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		out = append(out, public)
	}
	return out, nil
}

func readRecipientPEMs(paths []string) ([]string, error) {
	var out []string
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if _, err := keys.ParsePublic(data); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		out = append(out, string(data))
	}
	return out, nil
}

func validRecipientFile(path string) error {
	if path == "" {
		return nil
	}
	_, err := readRecipientPEMs([]string{path})
	return err
}
