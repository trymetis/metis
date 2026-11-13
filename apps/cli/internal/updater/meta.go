package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/mod/semver"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

const metaFile = "metis.json"

type Meta struct {
	Version string `json:"version"`
	MinCli  string `json:"minCli"`
}

func MetaURL(release string) string {
	return fmt.Sprintf("%s/v%s/%s", NotesOrigin, release, metaFile)
}

func FetchMeta(ctx context.Context, release string) (Meta, bool, error) {
	url := MetaURL(release)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Meta{}, false, err
	}
	req.Header.Set("User-Agent", "metis/"+version.Version)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return Meta{}, false, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusForbidden {
		return Meta{}, false, nil
	}
	if res.StatusCode != http.StatusOK {
		return Meta{}, false, fmt.Errorf("%s answered %d", url, res.StatusCode)
	}
	var meta Meta
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&meta); err != nil {
		return Meta{}, false, fmt.Errorf("%s: %w", url, err)
	}
	if meta.Version != release || !IsReleaseVersion(meta.MinCli) {
		return Meta{}, false, fmt.Errorf("%s does not describe %s", url, release)
	}
	return meta, true, nil
}

func CLISatisfies(minCli string) bool {
	if !IsReleaseVersion(version.Version) {
		return true
	}
	return semver.Compare("v"+version.Version, "v"+minCli) >= 0
}

func ListReleases(ctx context.Context) ([]string, error) {
	return fetchReleases(ctx)
}

func NewestCompatible(ctx context.Context) (Meta, error) {
	versions, err := fetchReleases(ctx)
	if err != nil {
		return Meta{}, fmt.Errorf("listing releases in %s: %w", Repository, err)
	}
	var newestNeedingCLI string
	for _, release := range versions {
		meta, found, err := FetchMeta(ctx, release)
		if err != nil {
			return Meta{}, err
		}
		if !found {
			continue
		}
		if CLISatisfies(meta.MinCli) {
			return meta, nil
		}
		if newestNeedingCLI == "" {
			newestNeedingCLI = meta.MinCli
		}
	}
	if newestNeedingCLI != "" {
		return Meta{}, fmt.Errorf("every published release needs Metis CLI %s or later; this is %s", newestNeedingCLI, version.Version)
	}
	return Meta{}, fmt.Errorf("no published release of %s has a %s yet", Repository, metaFile)
}
