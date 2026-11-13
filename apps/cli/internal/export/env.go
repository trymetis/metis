package export

import (
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/trymetis/metis/apps/cli/internal/envfile"
)

var requiredKeys = []string{"METIS_ENCRYPTION_KEY", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "METIS_OWNER_EMAIL"}

var excludedKeys = []string{
	"DATABASE_URL",
	"DATABASE_AUTH_TOKEN",
	"MASTRA_DATABASE_URL",
	"MASTRA_DATABASE_AUTH_TOKEN",
	"METIS_DB_DRIVER",
	"SQLD_AUTH_JWT_KEY",
	"SQLD_ADMIN_KEY",
	"METIS_MAINTENANCE",
	"METIS_UPDATER_SOCKET",
	"METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS",
}

type Env struct {
	keys   []string
	values map[string]string
}

func plain(value string) string {
	value = strings.TrimSuffix(value, "\r")
	if len(value) >= 2 {
		switch {
		case value[0] == '"' && value[len(value)-1] == '"':
			inner := value[1 : len(value)-1]
			replacer := strings.NewReplacer(`\\`, `\`, `\"`, `"`, `\n`, "\n")
			return replacer.Replace(inner)
		case value[0] == '\'' && value[len(value)-1] == '\'':
			return value[1 : len(value)-1]
		}
	}
	return value
}

func ReadEnv(path string) (*Env, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	file, err := envfile.Read(path)
	if err != nil {
		return nil, err
	}
	return FromFile(file), nil
}

func FromFile(file *envfile.File) *Env {
	env := &Env{values: map[string]string{}}
	for _, key := range file.Keys() {
		if _, seen := env.values[key]; !seen {
			env.keys = append(env.keys, key)
		}
		env.values[key] = plain(file.Value(key))
	}
	return env
}

func (env *Env) Get(key string) string {
	return env.values[key]
}

func (env *Env) Set(key, value string) {
	if _, ok := env.values[key]; !ok {
		env.keys = append(env.keys, key)
	}
	env.values[key] = value
}

func (env *Env) Missing() []string {
	var missing []string
	for _, key := range append([]string{"DATABASE_URL", "MASTRA_DATABASE_URL"}, requiredKeys...) {
		if strings.TrimSpace(env.values[key]) == "" {
			missing = append(missing, key)
		}
	}
	return missing
}

func (env *Env) Boot(drop []string) (string, error) {
	var out strings.Builder
	for _, key := range env.keys {
		if slices.Contains(excludedKeys, key) || slices.Contains(drop, key) {
			continue
		}
		value := env.values[key]
		if strings.ContainsAny(value, "\r\n") {
			return "", fmt.Errorf("%s holds a line break, which an env file cannot carry; drop it with --drop-env %s and set it again after loading", key, key)
		}
		fmt.Fprintf(&out, "%s=%s\n", key, value)
	}
	return out.String(), nil
}

func (env *Env) Lines() []string {
	var lines []string
	for _, key := range env.keys {
		lines = append(lines, key+"="+env.values[key])
	}
	return lines
}

func ParseEnv(content string) (*Env, error) {
	file, err := envfile.Parse(content)
	if err != nil {
		return nil, err
	}
	return FromFile(file), nil
}
