//go:build !unix

package state

import "errors"

type Lock struct {
	dir string
}

var ErrBusy = errors.New("another metis command is changing this install")

func TryAcquire(string) (*Lock, error) {
	return nil, errors.New("a Metis install runs on Linux only")
}

func Acquire(string) (*Lock, error) {
	return nil, errors.New("a Metis install runs on Linux only")
}

func (lock *Lock) Release() {}
