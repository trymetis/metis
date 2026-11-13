package caddy

import (
	"testing"

	"github.com/trymetis/metis/apps/cli/internal/state"
)

func TestRender(t *testing.T) {
	st := state.New()
	if Sites(st) != nil {
		t.Fatal("sites without caddy")
	}
	st.Components.Caddy = &state.Caddy{Domain: "mail.example.com"}
	st.Components.GatewayResend = &state.GatewayResend{Host: "resend.mail.example.com"}
	st.Components.Objstore = &state.Objstore{Direct: true}
	want := "mail.example.com {\n\treverse_proxy app:3000\n}\n\nresend.mail.example.com {\n\treverse_proxy gateway-resend:8787\n}\n\nstorage.mail.example.com {\n\treverse_proxy objstore:9000\n}\n"
	if got := Render(Sites(st)); got != want {
		t.Fatalf("Caddyfile:\n%s", got)
	}
}
