# Metis Suite desktop

An Electron window onto your own Metis instance. It bundles nothing of Metis: sign-in and account connections happen in your system browser and come back through `metis-suite://` deep links. [`agent-docs/desktop.md`](../../agent-docs/desktop.md) describes the protocol.

```sh
bun install     # from the repository root
cd apps/desktop
bun run start   # compile and launch
bun run dist    # package into release/ (dmg, nsis, deb, rpm)
```

`bun run build:desktop` from the repository root does the same as `bun run dist` here. On Linux the `.rpm` needs `rpmbuild` (`sudo apt install rpm` on Debian and Ubuntu); `bunx electron-builder --linux deb` after `bun run build` packages the `.deb` alone.

Install the `.deb` on Ubuntu 24.04 and later: `sudo apt install ./release/metis-suite-desktop_<version>_amd64.deb`. Its install script adds an AppArmor profile that lets the Chromium sandbox create user namespaces, the same thing Chrome's package does.

The instance must be reachable over `https://`, except on `localhost` during development.

The shell's own screens (loading, setup, sign-in, offline and settings) are a small React app in `renderer/`, built by Vite into `dist/renderer/` and opened with `loadFile`. They use the shared shadcn components and theme from `packages/ui`, whose neutral default palette is the shell's palette; Inter and JetBrains Mono come from `@fontsource-variable`.

On Linux the `metis-suite://` scheme only resolves once a `.desktop` file declares it, which the installed `.deb` does. Under `bun run start` the browser cannot hand the sign-in back to the app.

Under `bun run start` on those Ubuntu releases, Electron's unpackaged `chrome-sandbox` is neither root-owned nor covered by a profile. Chromium's documented options are in its [AppArmor userns guide](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
