package main

import (
	"io"
	"strings"
	"unicode"

	"charm.land/fang/v2"
)

func sentenceStart(text string) string {
	runes := []rune(text)
	start := 0
	for start < len(runes) && unicode.IsSpace(runes[start]) {
		start++
	}
	end := start
	for end < len(runes) && !unicode.IsSpace(runes[end]) {
		end++
	}
	if start == end {
		return text
	}
	word := runes[start:end]
	for len(word) > 0 && unicode.IsPunct(word[len(word)-1]) {
		word = word[:len(word)-1]
	}
	if len(word) == 0 {
		return text
	}
	for _, r := range word {
		if !unicode.IsLower(r) {
			return text
		}
	}
	runes[start] = unicode.ToUpper(runes[start])
	return string(runes)
}

type shownError struct {
	error
	text string
}

func (shown shownError) Error() string { return shown.text }

func (shown shownError) Unwrap() error { return shown.error }

func withoutFinalPeriod(err error) error {
	text := strings.TrimRight(err.Error(), " \n")
	if !strings.HasSuffix(text, ".") {
		return err
	}
	return shownError{error: err, text: strings.TrimSuffix(text, ".")}
}

func printError(w io.Writer, styles fang.Styles, err error) {
	styles.ErrorText = styles.ErrorText.UnsetTransform().Transform(sentenceStart)
	fang.DefaultErrorHandler(w, styles, withoutFinalPeriod(err))
}
