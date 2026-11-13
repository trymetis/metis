package updater

import (
	"encoding/json"

	"google.golang.org/protobuf/encoding/protojson"

	updaterv1 "github.com/trymetis/metis/apps/cli/gen/metis/updater/v1"
	"github.com/trymetis/metis/apps/cli/internal/state"
)

func lastOf(st *state.State) (*updaterv1.Upgrade, error) {
	raw := st.Updater.Last
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	upgrade := &updaterv1.Upgrade{}
	if err := protojson.Unmarshal(raw, upgrade); err != nil {
		return nil, err
	}
	return upgrade, nil
}

func setLast(st *state.State, upgrade *updaterv1.Upgrade) error {
	if upgrade == nil {
		st.Updater.Last = json.RawMessage("null")
		return nil
	}
	raw, err := protojson.Marshal(upgrade)
	if err != nil {
		return err
	}
	st.Updater.Last = raw
	return nil
}
