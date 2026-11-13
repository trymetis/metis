//go:build unix

package state

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/unix"
)

type Lock struct {
	dir  string
	file *os.File
}

func open(dir string) (*os.File, error) {
	return os.OpenFile(filepath.Join(dir, LockName), os.O_CREATE|os.O_RDWR, 0o600)
}

var ErrBusy = errors.New("another metis command is changing this install")

func TryAcquire(dir string) (*Lock, error) {
	file, err := open(dir)
	if err != nil {
		return nil, err
	}
	err = unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if errors.Is(err, unix.EWOULDBLOCK) {
		_ = file.Close()
		return nil, ErrBusy
	}
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("locking %s: %w", filepath.Join(dir, LockName), err)
	}
	return &Lock{dir: dir, file: file}, nil
}

func Acquire(dir string) (*Lock, error) {
	file, err := open(dir)
	if err != nil {
		return nil, err
	}
	err = unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if errors.Is(err, unix.EWOULDBLOCK) {
		if st, loadErr := Load(dir); loadErr == nil {
			if started, running := st.RunningUpgradeStart(); running {
				_ = file.Close()
				return nil, fmt.Errorf("An upgrade is running (started %s). Run metis status to follow it.", started.Local().Format("15:04"))
			}
			if what, started, running := st.RunningOperation(); running {
				_ = file.Close()
				return nil, fmt.Errorf("%s is running (started %s); the app is in maintenance until it ends. Try again then.", what, started.Local().Format("15:04"))
			}
		}
		err = unix.Flock(int(file.Fd()), unix.LOCK_EX)
	}
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("locking %s: %w", filepath.Join(dir, LockName), err)
	}
	return &Lock{dir: dir, file: file}, nil
}

func (lock *Lock) Release() {
	_ = unix.Flock(int(lock.file.Fd()), unix.LOCK_UN)
	_ = lock.file.Close()
}
