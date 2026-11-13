package ui

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
	"golang.org/x/term"
)

var (
	Accessible bool
	Out        io.Writer = os.Stdout

	bold    = lipgloss.NewStyle().Bold(true)
	good    = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	caution = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	faint   = lipgloss.NewStyle().Faint(true)
)

var ErrNoTTY = errors.New("this needs an answer and there is no terminal to ask on")

func Interactive() bool {
	return term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd()))
}

func accessible() bool {
	return Accessible || os.Getenv("TERM") == "dumb"
}

func Run(ctx context.Context, groups ...*huh.Group) error {
	if !Interactive() {
		return ErrNoTTY
	}
	return huh.NewForm(groups...).WithAccessible(accessible()).RunWithContext(ctx)
}

func Confirm(ctx context.Context, title, description string, yes bool) (bool, error) {
	if yes {
		return true, nil
	}
	if !Interactive() {
		return false, fmt.Errorf("%s Pass --yes to go ahead without a terminal", strings.TrimSpace(title))
	}
	answer := false
	field := huh.NewConfirm().Title(title).Affirmative("Yes").Negative("No").Value(&answer)
	if description != "" {
		field.Description(description)
	}
	if err := Run(ctx, huh.NewGroup(field)); err != nil {
		return false, err
	}
	return answer, nil
}

func Secret(ctx context.Context, title, description string) (string, error) {
	value := ""
	field := huh.NewInput().Title(title).EchoMode(huh.EchoModePassword).Value(&value).Validate(func(input string) error {
		if strings.TrimSpace(input) == "" {
			return errors.New("enter a value")
		}
		return nil
	})
	if description != "" {
		field.Description(description)
	}
	if err := Run(ctx, huh.NewGroup(field)); err != nil {
		return "", err
	}
	return strings.TrimSpace(value), nil
}

func Heading(format string, args ...any) {
	fmt.Fprintln(Out, bold.Render(fmt.Sprintf(format, args...)))
}

func Done(format string, args ...any) {
	fmt.Fprintln(Out, good.Render("✓ ")+fmt.Sprintf(format, args...))
}

func Warn(format string, args ...any) {
	fmt.Fprintln(Out, caution.Render("! ")+fmt.Sprintf(format, args...))
}

func Info(format string, args ...any) {
	fmt.Fprintf(Out, format+"\n", args...)
}

func Faint(format string, args ...any) {
	fmt.Fprintln(Out, faint.Render(fmt.Sprintf(format, args...)))
}
