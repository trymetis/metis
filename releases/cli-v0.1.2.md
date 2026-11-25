---
date: 2026-11-25
---

### Changed

- `metis domain set`, `metis domain remove` and moving a server to a new address (`metis db load --app-url`, setting up from an export at another address) warn that every user's passkeys stop working at the new address and how users get back in.
- The maintenance page on a server with a domain says how long maintenance has lasted and reloads by itself when the app is back, instead of "Try again in a few minutes."
