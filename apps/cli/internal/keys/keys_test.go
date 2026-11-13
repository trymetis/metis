package keys

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"strings"
	"testing"
)

func testKDF() KDF {
	return KDF{Name: KDFName, T: 1, M: 1024, P: 1, Salt: []byte("0123456789abcdef")}
}

func TestGeneratedPairRoundTrips(t *testing.T) {
	private, err := Generate()
	if err != nil {
		t.Fatal(err)
	}
	privatePEM, err := MarshalPrivate(private)
	if err != nil {
		t.Fatal(err)
	}
	publicPEM, err := MarshalPublic(private.PublicKey(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(privatePEM), "-----BEGIN PRIVATE KEY-----") || !strings.HasPrefix(string(publicPEM), "-----BEGIN PUBLIC KEY-----") {
		t.Fatalf("pem types:\n%s\n%s", privatePEM, publicPEM)
	}
	parsedPrivate, err := ParsePrivate(privatePEM)
	if err != nil {
		t.Fatal(err)
	}
	parsedPublic, err := ParsePublic(publicPEM)
	if err != nil {
		t.Fatal(err)
	}
	if parsedPublic.KDF != nil || !parsedPublic.Key.Equal(private.PublicKey()) || !parsedPrivate.Equal(private) {
		t.Fatal("the pair did not round trip")
	}
	fingerprint := Fingerprint(private.PublicKey())
	if len(fingerprint) != 32 || fingerprint != Fingerprint(parsedPublic.Key) {
		t.Fatalf("fingerprint %q", fingerprint)
	}
}

func TestOpenSSLStyleSEC1KeyWithParameters(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	params := pem.EncodeToMemory(&pem.Block{Type: "EC PARAMETERS", Bytes: []byte{0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07}})
	data := append(params, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})...)
	parsed, err := ParsePrivate(data)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := key.ECDH()
	if !parsed.Equal(want) {
		t.Fatal("the SEC1 key did not parse to the same key")
	}
}

func TestOtherKeysAreRefusedByName(t *testing.T) {
	p384, _ := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(p384)
	if _, err := ParsePrivate(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})); err == nil || !strings.Contains(err.Error(), "P-384") {
		t.Fatalf("P-384 private key: %v", err)
	}
	publicDER, _ := x509.MarshalPKIXPublicKey(&p384.PublicKey)
	if _, err := ParsePublic(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER})); err == nil || !strings.Contains(err.Error(), "P-384") {
		t.Fatalf("P-384 public key: %v", err)
	}
	_, edPrivate, _ := ed25519.GenerateKey(rand.Reader)
	edDER, _ := x509.MarshalPKCS8PrivateKey(edPrivate)
	if _, err := ParsePrivate(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: edDER})); err == nil || !strings.Contains(err.Error(), "ed25519") {
		t.Fatalf("ed25519 key: %v", err)
	}
	if _, err := ParsePrivate(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: []byte{1}})); err == nil || !strings.Contains(err.Error(), "RSA PRIVATE KEY") {
		t.Fatalf("RSA block: %v", err)
	}
	if _, err := ParsePublic([]byte("not a key")); err == nil {
		t.Fatal("garbage parsed as a public key")
	}
}

func TestPassphraseKeyIsDeterministicAndCarriesItsParameters(t *testing.T) {
	kdf := testKDF()
	first, err := Derive("correct horse battery staple", kdf)
	if err != nil {
		t.Fatal(err)
	}
	again, _ := Derive("correct horse battery staple", kdf)
	other, _ := Derive("correct horse battery stapler", kdf)
	if !first.Equal(again) || first.Equal(other) {
		t.Fatal("derivation is not deterministic per passphrase")
	}
	publicPEM, err := MarshalPublic(first.PublicKey(), &kdf)
	if err != nil {
		t.Fatal(err)
	}
	for _, header := range []string{"Metis-KDF: argon2id", "Metis-KDF-Params: t=1,m=1024,p=1", "Metis-KDF-Salt: MDEyMzQ1Njc4OWFiY2RlZg=="} {
		if !strings.Contains(string(publicPEM), header) {
			t.Fatalf("missing %q in\n%s", header, publicPEM)
		}
	}
	parsed, err := ParsePublic(publicPEM)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.KDF == nil || parsed.KDF.T != 1 || parsed.KDF.M != 1024 || parsed.KDF.P != 1 || string(parsed.KDF.Salt) != "0123456789abcdef" {
		t.Fatalf("kdf %+v", parsed.KDF)
	}
	if !parsed.Key.Equal(first.PublicKey()) {
		t.Fatal("the public key changed")
	}
}

func TestNewKDFUsesTheRecommendedParameters(t *testing.T) {
	kdf, err := NewKDF()
	if err != nil {
		t.Fatal(err)
	}
	if kdf.Name != KDFName || kdf.T != 3 || kdf.M != 65536 || kdf.P != 4 || len(kdf.Salt) != 16 {
		t.Fatalf("kdf %+v", kdf)
	}
	if _, err := Derive("x", KDF{Name: "scrypt", T: 1, M: 1, P: 1, Salt: []byte{1}}); err == nil {
		t.Fatal("an unknown derivation was accepted")
	}
}
