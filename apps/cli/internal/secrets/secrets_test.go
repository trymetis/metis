package secrets

import (
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"testing"
)

func TestTokens(t *testing.T) {
	if token := Token(); len(token) != 40 || strings.ContainsAny(token, "+/=") {
		t.Fatalf("token %q", token)
	}
	key, err := base64.StdEncoding.DecodeString(EncryptionKey())
	if err != nil || len(key) != 32 {
		t.Fatalf("encryption key %v %v", key, err)
	}
	if Token() == Token() {
		t.Fatal("two tokens are equal")
	}
}

func TestSqldAuth(t *testing.T) {
	auth, err := NewSqldAuth()
	if err != nil {
		t.Fatal(err)
	}
	public, err := base64.RawURLEncoding.DecodeString(auth.JWTKey)
	if err != nil || len(public) != ed25519.PublicKeySize {
		t.Fatalf("jwt key %v", err)
	}
	parts := strings.Split(auth.Token, ".")
	if len(parts) != 3 {
		t.Fatalf("token %q", auth.Token)
	}
	payload, _ := base64.RawURLEncoding.DecodeString(parts[1])
	signature, _ := base64.RawURLEncoding.DecodeString(parts[2])
	if string(payload) != `{"a":"rw"}` || !ed25519.Verify(public, []byte(parts[0]+"."+parts[1]), signature) {
		t.Fatal("the token does not verify against the key")
	}
}
