//go:build windows

package archive

import "golang.org/x/sys/windows"

func FreeBytes(dir string) (uint64, error) {
	path, err := windows.UTF16PtrFromString(dir)
	if err != nil {
		return 0, err
	}
	var free uint64
	if err := windows.GetDiskFreeSpaceEx(path, &free, nil, nil); err != nil {
		return 0, err
	}
	return free, nil
}
