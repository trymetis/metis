package main

import (
	"errors"
	"testing"
)

func TestSentenceStartCapitalizesOnlyAPlainFirstWord(t *testing.T) {
	for text, want := range map[string]string{
		"the workers use redis; run metis remove worker first": "The workers use redis; run metis remove worker first",
		"away from the server, pass --endpoint":                "Away from the server, pass --endpoint",
		"  there is no upgrade to undo":                        "  There is no upgrade to undo",
		"METIS_DRIVE_RELAY_MAX_MB are dashboard settings":      "METIS_DRIVE_RELAY_MAX_MB are dashboard settings",
		"https://mail.example.com/v1/health did not answer":    "https://mail.example.com/v1/health did not answer",
		"metis.json is locked":                                 "metis.json is locked",
		"sqld's admin port is closed":                          "sqld's admin port is closed",
		"Preflight failed":                                     "Preflight failed",
		"":                                                     "",
	} {
		if got := sentenceStart(text); got != want {
			t.Fatalf("%q became %q, want %q", text, got, want)
		}
	}
}

func TestAnErrorIsShownWithOnePeriod(t *testing.T) {
	plain := errors.New("there is no upgrade to undo")
	if got := withoutFinalPeriod(plain); got != plain {
		t.Fatalf("an error without a period changed: %v", got)
	}
	ended := errors.New("An upgrade is running (started 14:02). Run metis status to follow it.")
	got := withoutFinalPeriod(ended)
	if got.Error() != "An upgrade is running (started 14:02). Run metis status to follow it" || !errors.Is(got, ended) {
		t.Fatalf("the final period stayed, so the terminal would print two: %q", got.Error())
	}
}
