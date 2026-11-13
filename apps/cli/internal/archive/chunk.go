package archive

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const chunkSize = 64 * 1024

func fileAEAD(exportKey []byte, name string) (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, exportKey, nil, fileInfo+name, 32)
	if err != nil {
		return nil, err
	}
	return newGCM(key)
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func chunkNonce(index uint64, last bool) []byte {
	nonce := make([]byte, 12)
	binary.BigEndian.PutUint64(nonce[3:11], index)
	if last {
		nonce[11] = 1
	}
	return nonce
}

type sealer struct {
	aead  cipher.AEAD
	aad   []byte
	out   io.Writer
	buf   []byte
	index uint64
}

func newSealer(aead cipher.AEAD, aad []byte, out io.Writer) *sealer {
	return &sealer{aead: aead, aad: aad, out: out}
}

func (s *sealer) seal(plain []byte, last bool) error {
	sealed := s.aead.Seal(nil, chunkNonce(s.index, last), plain, s.aad)
	s.index++
	_, err := s.out.Write(sealed)
	return err
}

func (s *sealer) Write(p []byte) (int, error) {
	s.buf = append(s.buf, p...)
	for len(s.buf) > chunkSize {
		if err := s.seal(s.buf[:chunkSize], false); err != nil {
			return 0, err
		}
		s.buf = append(s.buf[:0], s.buf[chunkSize:]...)
	}
	return len(p), nil
}

func (s *sealer) Close() error {
	err := s.seal(s.buf, true)
	s.buf = nil
	return err
}

type opener struct {
	aead  cipher.AEAD
	aad   []byte
	in    *bufio.Reader
	name  string
	index uint64
	plain []byte
	done  bool
}

func newOpener(aead cipher.AEAD, aad []byte, in io.Reader, name string) *opener {
	return &opener{aead: aead, aad: aad, in: bufio.NewReaderSize(in, chunkSize+aead.Overhead()+1), name: name}
}

func (o *opener) Read(p []byte) (int, error) {
	for len(o.plain) == 0 {
		if o.done {
			return 0, io.EOF
		}
		if err := o.next(); err != nil {
			return 0, err
		}
	}
	n := copy(p, o.plain)
	o.plain = o.plain[n:]
	return n, nil
}

func (o *opener) next() error {
	block := make([]byte, chunkSize+o.aead.Overhead())
	n, err := io.ReadFull(o.in, block)
	last := false
	switch {
	case errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF):
		block = block[:n]
		last = true
	case err != nil:
		return fmt.Errorf("%s: %w", o.name, err)
	default:
		_, peekErr := o.in.Peek(1)
		last = errors.Is(peekErr, io.EOF)
	}
	if n == 0 {
		return fmt.Errorf("%s is truncated: it ends before its last chunk", o.name)
	}
	plain, err := o.aead.Open(nil, chunkNonce(o.index, last), block, o.aad)
	if err != nil {
		if last {
			if _, inner := o.aead.Open(nil, chunkNonce(o.index, false), block, o.aad); inner == nil {
				return fmt.Errorf("%s is truncated: it ends before its last chunk", o.name)
			}
		}
		return fmt.Errorf("%s: chunk %d failed authentication; the file or its header was changed, or the chunks were reordered", o.name, o.index)
	}
	o.plain = plain
	o.index++
	o.done = last
	return nil
}
