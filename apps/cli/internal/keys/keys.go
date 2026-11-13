package keys

import (
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	KDFName        = "argon2id"
	headerKDF      = "Metis-KDF"
	headerParams   = "Metis-KDF-Params"
	headerSalt     = "Metis-KDF-Salt"
	saltBytes      = 16
	seedBytes      = 32
	derivationInfo = "metis-export/v1/p256/"
	maxDerivations = 64
)

type KDF struct {
	Name string `json:"name"`
	T    uint32 `json:"t"`
	M    uint32 `json:"m"`
	P    uint8  `json:"p"`
	Salt []byte `json:"salt"`
}

type Public struct {
	Key *ecdh.PublicKey
	KDF *KDF
}

func NewKDF() (KDF, error) {
	salt := make([]byte, saltBytes)
	if _, err := rand.Read(salt); err != nil {
		return KDF{}, err
	}
	return KDF{Name: KDFName, T: 3, M: 64 * 1024, P: 4, Salt: salt}, nil
}

func Generate() (*ecdh.PrivateKey, error) {
	return ecdh.P256().GenerateKey(rand.Reader)
}

func Fingerprint(key *ecdh.PublicKey) string {
	sum := sha256.Sum256(key.Bytes())
	return hex.EncodeToString(sum[:16])
}

func Derive(passphrase string, kdf KDF) (*ecdh.PrivateKey, error) {
	if kdf.Name != KDFName {
		return nil, fmt.Errorf("unknown key derivation %q", kdf.Name)
	}
	if kdf.T == 0 || kdf.M == 0 || kdf.P == 0 || len(kdf.Salt) == 0 {
		return nil, errors.New("the key derivation parameters are incomplete")
	}
	seed := argon2.IDKey([]byte(passphrase), kdf.Salt, kdf.T, kdf.M, kdf.P, seedBytes)
	for counter := range maxDerivations {
		candidate, err := hkdf.Key(sha256.New, seed, nil, derivationInfo+strconv.Itoa(counter), 32)
		if err != nil {
			return nil, err
		}
		if key, err := ecdh.P256().NewPrivateKey(candidate); err == nil {
			return key, nil
		}
	}
	return nil, errors.New("no valid key came from this passphrase")
}

func MarshalPrivate(key *ecdh.PrivateKey) ([]byte, error) {
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), nil
}

func MarshalPublic(key *ecdh.PublicKey, kdf *KDF) ([]byte, error) {
	der, err := x509.MarshalPKIXPublicKey(key)
	if err != nil {
		return nil, err
	}
	block := &pem.Block{Type: "PUBLIC KEY", Bytes: der}
	if kdf != nil {
		block.Headers = map[string]string{
			headerKDF:    kdf.Name,
			headerParams: fmt.Sprintf("t=%d,m=%d,p=%d", kdf.T, kdf.M, kdf.P),
			headerSalt:   base64.StdEncoding.EncodeToString(kdf.Salt),
		}
	}
	return pem.EncodeToMemory(block), nil
}

func p256(key any) (*ecdh.PublicKey, error) {
	switch typed := key.(type) {
	case *ecdsa.PublicKey:
		if typed.Curve != elliptic.P256() {
			return nil, fmt.Errorf("the key is on %s; export keys use P-256 (prime256v1)", typed.Curve.Params().Name)
		}
		return typed.ECDH()
	case *ecdh.PublicKey:
		if typed.Curve() != ecdh.P256() {
			return nil, errors.New("the key is not on P-256 (prime256v1)")
		}
		return typed, nil
	default:
		return nil, fmt.Errorf("the key is %T; export keys are P-256 (prime256v1) EC keys", key)
	}
}

func ParsePublic(data []byte) (*Public, error) {
	block := firstBlock(data, "PUBLIC KEY")
	if block == nil {
		return nil, errors.New("no PUBLIC KEY block found; pass a .pub file")
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("reading the public key: %w", err)
	}
	key, err := p256(parsed)
	if err != nil {
		return nil, err
	}
	public := &Public{Key: key}
	if name, ok := block.Headers[headerKDF]; ok {
		kdf, err := parseKDF(name, block.Headers[headerParams], block.Headers[headerSalt])
		if err != nil {
			return nil, err
		}
		public.KDF = kdf
	}
	return public, nil
}

func parseKDF(name, params, salt string) (*KDF, error) {
	kdf := &KDF{Name: name}
	if name != KDFName {
		return nil, fmt.Errorf("unknown key derivation %q", name)
	}
	for part := range strings.SplitSeq(params, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			return nil, fmt.Errorf("%s %q is not t=…,m=…,p=…", headerParams, params)
		}
		number, err := strconv.ParseUint(value, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("%s %q: %w", headerParams, params, err)
		}
		switch key {
		case "t":
			kdf.T = uint32(number)
		case "m":
			kdf.M = uint32(number)
		case "p":
			if number > 255 {
				return nil, fmt.Errorf("%s p=%d is too large", headerParams, number)
			}
			kdf.P = uint8(number)
		}
	}
	raw, err := base64.StdEncoding.DecodeString(salt)
	if err != nil || len(raw) == 0 {
		return nil, fmt.Errorf("%s is not base64", headerSalt)
	}
	kdf.Salt = raw
	if kdf.T == 0 || kdf.M == 0 || kdf.P == 0 {
		return nil, fmt.Errorf("%s %q is incomplete", headerParams, params)
	}
	return kdf, nil
}

func ParsePrivate(data []byte) (*ecdh.PrivateKey, error) {
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return nil, errors.New("no PRIVATE KEY or EC PRIVATE KEY block found; pass a .key file")
		}
		switch block.Type {
		case "PRIVATE KEY":
			parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				return nil, fmt.Errorf("reading the private key: %w", err)
			}
			return privateP256(parsed)
		case "EC PRIVATE KEY":
			parsed, err := x509.ParseECPrivateKey(block.Bytes)
			if err != nil {
				return nil, fmt.Errorf("reading the private key: %w", err)
			}
			return privateP256(parsed)
		case "EC PARAMETERS":
			continue
		default:
			return nil, fmt.Errorf("the file holds a %s block; export identities are P-256 private keys", block.Type)
		}
	}
}

func privateP256(key any) (*ecdh.PrivateKey, error) {
	switch typed := key.(type) {
	case *ecdsa.PrivateKey:
		if typed.Curve != elliptic.P256() {
			return nil, fmt.Errorf("the key is on %s; export keys use P-256 (prime256v1)", typed.Curve.Params().Name)
		}
		return typed.ECDH()
	case *ecdh.PrivateKey:
		if typed.Curve() != ecdh.P256() {
			return nil, errors.New("the key is not on P-256 (prime256v1)")
		}
		return typed, nil
	default:
		return nil, fmt.Errorf("the key is %T; export keys are P-256 (prime256v1) EC keys", key)
	}
}

func firstBlock(data []byte, kind string) *pem.Block {
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil || block.Type == kind {
			return block
		}
	}
}
