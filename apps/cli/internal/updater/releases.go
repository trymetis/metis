package updater

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"golang.org/x/mod/semver"

	"github.com/trymetis/metis/apps/cli/internal/version"
)

const (
	NotesOrigin   = "https://sh.trymetis.email"
	notesFile     = "release.md"
	notesTimeout  = 10 * time.Second
	notesMaxBytes = 256 << 10
)

type Release struct {
	Version string
	Notes   string
	MinCli  string
}

type Releases struct {
	TTL time.Duration

	mu             sync.Mutex
	versions       []string
	fetchedAt      time.Time
	notes          map[string]string
	metas          map[string]Meta
	notesFetchedAt time.Time
}

func NotesURL(version string) string {
	return fmt.Sprintf("%s/v%s/%s", NotesOrigin, version, notesFile)
}

func (releases *Releases) List(ctx context.Context, current string) ([]Release, error) {
	releases.mu.Lock()
	defer releases.mu.Unlock()
	if err := releases.refreshLocked(ctx); err != nil {
		return nil, err
	}
	if time.Since(releases.notesFetchedAt) >= releases.TTL {
		releases.fetchNotesLocked(ctx, current)
	}
	list := make([]Release, 0, len(releases.versions))
	for _, version := range releases.versions {
		meta, described := releases.metas[version]
		if newer(version, current) && !described {
			continue
		}
		list = append(list, Release{Version: version, Notes: releases.notes[version], MinCli: meta.MinCli})
	}
	return list, nil
}

func (releases *Releases) refreshLocked(ctx context.Context) error {
	if releases.versions != nil && time.Since(releases.fetchedAt) < releases.TTL {
		return nil
	}
	versions, err := fetchReleases(ctx)
	if err != nil {
		if releases.versions != nil {
			log.Printf("[updater] listing releases failed, keeping the last list: %v", err)
			return nil
		}
		return err
	}
	releases.versions = versions
	releases.fetchedAt = time.Now()
	return nil
}

func newer(version, current string) bool {
	return current == "" || semver.Compare("v"+version, "v"+current) > 0
}

func (releases *Releases) fetchNotesLocked(ctx context.Context, current string) {
	ctx, cancel := context.WithTimeout(ctx, notesTimeout)
	defer cancel()
	if releases.notes == nil {
		releases.notes = map[string]string{}
		releases.metas = map[string]Meta{}
	}
	for _, version := range releases.versions {
		if !newer(version, current) {
			continue
		}
		if _, ok := releases.metas[version]; !ok {
			meta, found, err := FetchMeta(ctx, version)
			if err != nil {
				log.Printf("[updater] fetching %s failed: %v", MetaURL(version), err)
			} else if found {
				releases.metas[version] = meta
			}
		}
		if _, ok := releases.notes[version]; ok {
			continue
		}
		notes, found, err := fetchNotes(ctx, version)
		if err != nil {
			log.Printf("[updater] fetching release notes for %s failed: %v", version, err)
			continue
		}
		if found {
			releases.notes[version] = notes
		}
	}
	releases.notesFetchedAt = time.Now()
}

func (releases *Releases) Find(ctx context.Context, current, version string) (Release, bool, error) {
	list, err := releases.List(ctx, current)
	if err != nil {
		return Release{}, false, err
	}
	for _, release := range list {
		if release.Version == version {
			return release, true, nil
		}
	}
	return Release{}, false, nil
}

func fetchReleases(ctx context.Context) ([]string, error) {
	repo, err := name.NewRepository(Repository)
	if err != nil {
		return nil, err
	}
	tags, err := remote.List(repo, remote.WithContext(ctx), remote.WithAuth(authn.Anonymous))
	if err != nil {
		return nil, err
	}
	versions := []string{}
	for _, tag := range tags {
		if IsReleaseVersion(tag) {
			versions = append(versions, tag)
		}
	}
	slices.SortFunc(versions, func(a, b string) int {
		return semver.Compare("v"+b, "v"+a)
	})
	return versions, nil
}

func fetchNotes(ctx context.Context, release string) (string, bool, error) {
	url := NotesURL(release)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Accept", "text/markdown, text/plain")
	req.Header.Set("User-Agent", "metis/"+version.Version)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", false, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return "", false, nil
	}
	if res.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("%s answered %d", url, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, notesMaxBytes))
	if err != nil {
		return "", false, err
	}
	return strings.TrimSpace(string(body)), true, nil
}
