package updater

import (
	"regexp"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

const Repository = "ghcr.io/trymetis/metis"

var releaseVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

func IsReleaseVersion(version string) bool {
	return releaseVersion.MatchString(version)
}

type Images = state.Images

func ReleaseImages(version string) Images {
	return Images{
		App:       Repository + ":" + version,
		Preflight: Repository + ":" + version + "-preflight",
		Worker:    Repository + ":" + version + "-worker",
	}
}

func ImagesVersion(images Images) string {
	version, ok := strings.CutPrefix(images.App, Repository+":")
	if !ok || !IsReleaseVersion(version) || images != ReleaseImages(version) {
		return ""
	}
	return version
}
