package secrets

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
)

func Token() string {
	buf := make([]byte, 30)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func EncryptionKey() string {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	return base64.StdEncoding.EncodeToString(buf)
}

func Hex(bytes int) string {
	buf := make([]byte, bytes)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

type SqldAuth struct {
	JWTKey string
	Token  string
}

func NewSqldAuth() (SqldAuth, error) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return SqldAuth{}, err
	}
	encode := base64.RawURLEncoding.EncodeToString
	signing := encode([]byte(`{"alg":"EdDSA","typ":"JWT"}`)) + "." + encode([]byte(`{"a":"rw"}`))
	signature := ed25519.Sign(private, []byte(signing))
	return SqldAuth{JWTKey: encode(public), Token: signing + "." + encode(signature)}, nil
}
