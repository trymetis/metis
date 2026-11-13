package components

import (
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
)

func TestInstanceKeysMatchTheApp(t *testing.T) {
	source, err := os.ReadFile("../../../web/src/config/sections.ts")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	start := strings.Index(text, "export const SECTION_ENV_VARS")
	end := strings.Index(text[start:], "\n};")
	if start < 0 || end < 0 {
		t.Fatal("SECTION_ENV_VARS not found in sections.ts")
	}
	var app []string
	for _, match := range regexp.MustCompile(`"([A-Z0-9_]+)"`).FindAllStringSubmatch(text[start:start+end], -1) {
		if !slices.Contains(app, match[1]) {
			app = append(app, match[1])
		}
	}
	slices.Sort(app)
	ours := slices.Clone(InstanceKeys)
	slices.Sort(ours)
	if strings.Join(app, ",") != strings.Join(ours, ",") {
		t.Fatalf("InstanceKeys differs from SECTION_ENV_VARS in apps/web/src/config/sections.ts:\napp:  %v\nours: %v", app, ours)
	}
}
