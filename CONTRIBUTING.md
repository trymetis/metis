# Contributing to Metis Suite

Thanks for thinking about contributing. This document explains how to
get involved and the few legal steps that protect both you and AstraQ
Cyber Defence Pvt. Ltd. ("AstraQ") so that contributions can be merged
without later disputes.

## Code of conduct

Be civil. Disagree with ideas, not people. AstraQ reserves the right to
remove contributors who are repeatedly hostile, harassing, or abusive
in issues, pull requests, or community channels.

## How to report a bug

1. Search existing issues at https://github.com/trymetis/metis/issues
   to avoid duplicates.
2. If your bug is a security vulnerability, please do not open a public
   issue. Follow SECURITY.md instead.
3. For non-security bugs, open a new issue with:
   - What you did
   - What you expected to happen
   - What actually happened
   - Your environment (OS, Node or Bun version, browser if relevant)
   - Steps to reproduce, ideally with a minimal example

## How to propose a feature

1. Open a GitHub Discussion or issue describing the problem you are
   trying to solve, not just the feature you want.
2. Wait for a maintainer response before starting significant work.
   This avoids wasted effort if the feature is out of scope.
3. Small, contained improvements (typos, doc fixes, dependency
   bumps) do not need pre-discussion. Just send the pull request.

## How to send a pull request

1. Fork the repository.
2. Create a branch off `main` with a short descriptive name, for
   example `fix/zoho-token-refresh` or `feat/draft-templates`.
3. Make your change. Keep commits focused and reasonable in size.
4. Run the local checks before pushing:
   ```
   bun run typecheck
   bun run lint
   ```
   CI runs the same two checks on every push and pull request, plus
   `gofmt -l`, `go vet` and `go test` in the Go modules (`apps/cli`, `e2e/fakes`).
5. If you changed `package.json` dependencies: run `bun install` from the
   repository root, then check anything new is license-compatible with
   AGPL-3.0-or-later:
   ```
   bun run --cwd apps/web licenses
   ```
6. Open a pull request against `main` with a clear description of
   what the change does and why.

## Developer Certificate of Origin (DCO)

Every commit in a pull request must be signed off using the
Developer Certificate of Origin v1.1 (https://developercertificate.org/).
This is a lightweight alternative to a Contributor License Agreement.
By signing off, you certify that you wrote the code or otherwise have
the right to submit it under the project's license.

To sign off, add the `-s` flag to your `git commit` command:

```
git commit -s -m "Fix Zoho token refresh"
```

This appends a line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Pull requests with commits that are not signed off will be asked to
amend their commits before review.

## License of contributions

By submitting a contribution you agree that your contribution is
licensed under the same GNU Affero General Public License v3.0 or
later as the rest of the work, as described in the LICENSE file. You
retain copyright in your contribution.

If you are contributing on behalf of your employer, please ensure your
employer is aware of and agrees to this arrangement before submitting.

## What we will accept

- Bug fixes with a clear reproduction and a fix.
- Documentation improvements.
- New features that align with the project roadmap. Check open issues
  and discussions for what is in scope.
- Performance improvements with benchmark numbers.
- Test coverage for existing untested code.

## What we will not accept

- Code with unclear copyright or licensing provenance.
- Large unsolicited refactors that have not been discussed first.
- Changes that break the public API of the mail adapters without a
  migration path.
- Issues or pull requests for the marketing site in `apps/www/`. AstraQ
  maintains it internally.

## Maintainer response times

Best effort. AstraQ is a small team. We aim to respond to new issues
and pull requests within seven days. If you have not heard back after
two weeks, feel free to ping the issue politely.

## Proprietary modules

The AstraQ phishing-backend is a separate proprietary product and is
not part of this repository.

## Thanks

Every contribution, large or small, helps. If something here is
unclear, open a discussion and we will fix the document.
