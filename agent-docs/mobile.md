# Mobile shell — Expo over the user's own instance

The iOS and Android shell: the desktop shell's rules and `native` protocol on a phone, the cookie store shared with the webview, the one local native module, navigation, downloads, settings and look.
Paths without a workspace prefix are in `apps/mobile/`; web paths are written in full.
See also [AGENTS.md](../AGENTS.md), [desktop.md](desktop.md), [downloads.md](downloads.md), [ui.md](ui.md), [auth.md](auth.md), `apps/mobile/README.md` (build prerequisites, emulator setup).

## Code map

| Concern                  | Where                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry                    | `index.ts` (imports `react-native-url-polyfill/auto` before `expo-router/entry`) · `package.json` → `main`                                                                                                                                      |
| Screens                  | `app/index.tsx` (renders `useShell().screen`) · `app/settings.tsx`, `app/popup.tsx` (modal routes) · `app/_layout.tsx` · `components/shell/*-screen.tsx` · frame `components/screen.tsx` → `Screen` · `components/metis-mark.tsx` → `MetisMark` |
| UI primitives            | `components/ui/` (React Native Reusables) · `components.json` · `lib/utils.ts` → `cn`                                                                                                                                                           |
| Incoming links           | `app/+native-intent.tsx` → `redirectSystemPath` · `lib/lifecycle.ts` → `startShell`                                                                                                                                                             |
| Shell state              | `lib/shell.ts` → `useShell`                                                                                                                                                                                                                     |
| Webview and navigation   | `components/shell/server-view.tsx` · `components/shell/web-view-rules.ts` → `useServerRequests`, `apply`, `openPopup` · `decide` from `@metis/shell-core/navigation` ([desktop.md](desktop.md))                                                 |
| Login, session, tickets  | `lib/auth.ts` → `beginLogin`, `connectTicketUrl` · `lib/http.ts` → `requestJson`                                                                                                                                                                |
| Links and constants      | `@metis/shell-core/links` → `SCHEME`, `USER_AGENT_TOKEN`, `SETTINGS_PATH`, `parseDeepLink` · `lib/navigation.ts` → `openExternal`                                                                                                               |
| Stored state             | `lib/store.ts` → `readServer`                                                                                                                                                                                                                   |
| Settings                 | `lib/settings-types.ts` → `Settings` · `lib/settings.ts` → `readSettings`, `writeSettings`                                                                                                                                                      |
| Update notices (Android) | `lib/update.ts` → `checkForUpdatesIfDue`, `useUpdate`, `downloadUpdate`                                                                                                                                                                         |
| Downloads                | `lib/downloads.ts` → `downloadAndShare`                                                                                                                                                                                                         |
| Step log                 | `lib/log.ts` → `log`                                                                                                                                                                                                                            |
| Native module            | `modules/metis-shell/index.ts` → `clearStorageData` · `modules/metis-shell/{ios,android}/`                                                                                                                                                      |
| Config plugins           | `app.json` · `plugins/with-loopback-cleartext.js` · `plugins/with-version-code.js`, `plugins/with-release-signing.js` ([downloads.md](downloads.md))                                                                                            |
| Theme and fonts          | `global.css` (`@variant light` / `dark`) · `metro.config.js` (Uniwind) · fonts in `app.json`                                                                                                                                                    |
| Web side of the protocol | `apps/web/src/auth/native.ts`, `native-ticket.ts`, `native-link.ts`, `apps/web/src/app/(auth)/native/` ([desktop.md](desktop.md))                                                                                                               |

## Rules

- **The mobile shell follows the desktop shell's rules and speaks the same protocol** ([desktop.md](desktop.md)); sign-in and connecting accounts open the system browser through `Linking.openURL`.
- **`lib/` mirrors the desktop main process module for module**, minus the desktop-only `tray`, `autostart` and `preload` and the deep-link argument scan in the desktop's `links.ts`. `lib/shell.ts` plays `main.ts`, a zustand store whose `screen` replaces swapping window contents, and `lib/lifecycle.ts` holds its event wiring.
- **The logic both shells share comes from `@metis/shell-core`** ([desktop.md](desktop.md)); Metro resolves the workspace package through its `exports`.
- **Development builds only**: Expo Go cannot register `metis-suite://` or load `modules/metis-shell`.
- **`lib/lifecycle.ts` handles incoming links through `Linking`**, as the desktop does with `open-url` / `second-instance`; `redirectSystemPath` returns `/` for the launch link and `null` otherwise, so Expo Router routes none.
- **React Native's `fetch` and the webview must share one cookie store**, as the desktop's `net.request` and window share `persist:metis-suite`.
  - Android shares it natively: React Native's cookie handler is `android.webkit.CookieManager`.
  - iOS needs `sharedCookiesEnabled`, which copies `NSHTTPCookieStorage` into the WKWebView store on load and copies WKWebView changes back.
- **Every POST sends `Origin: <server>` explicitly** (`requestJson`), because Better Auth's origin check rejects a cookie-carrying POST without one (`MISSING_OR_NULL_ORIGIN`).
- **`modules/metis-shell` is the app's only native code.**
- **Sign-out, server change and reset call `clearStorageData()`, so they work with the server unreachable**, as on the desktop.
  - iOS: all WKWebView website data and `HTTPCookieStorage`.
  - Android: `CookieManager.removeAllCookies`, `WebStorage` and the WebView HTTP cache.
- **`react-native-url-polyfill/auto` loads before any route**, because every origin comparison here is a security check and React Native's built-in `URL` is not WHATWG: it parses with regexes, returns an empty `hostname` / `origin` for `metis-suite://auth?…`, and never throws on garbage.
- **Only `isTopFrame === false` counts as a subframe** (`useServerRequests`), because react-native-webview's Android event leaves `isTopFrame` out; treating a missing value as a subframe would let every Android navigation through.
- **Only server-origin load failures reach the offline or sign-in screens.** A main-frame load that fails on another origin (a download redirect) shows an alert.
- **Settings belong to the shell, reached from the web's "App settings" item as on the desktop.** The webview's `applicationNameForUserAgent` carries `MetisSuite/<version>`, and `decide()` turns `/native/settings` into a push of the Settings route.
- **Plain HTTP only on loopback**, as on the desktop: `with-loopback-cleartext.js` writes an Android network security config that permits cleartext for `localhost` and `127.0.0.1` alone.
- **A same-origin popup opens in the `popup` modal route, never in place of the open page.**
  - `app/popup.tsx` runs a second `WebView` with the same `useServerRequests` rules, `sharedCookiesEnabled`, user agent and downloads, and re-checks its `url` param with `decide()`.
  - Its close button and Android's back button close it; a sign-in path in it closes it and shows the sign-in screen.
  - The flows that reach it are links in rendered mail (the email frame's `<base target="_blank">`) and summary, unsubscribe and event links that point at the instance.
- **Android's back button walks the webview's history only while the main screen is focused** (`useFocusEffect`), so it closes Settings or a popup first.
- **Update notices are Android-only**, as on the desktop otherwise: "Check for updates" in General, a check at start-up and on resume at most once a day against `downloads.trymetis.email`, a native alert with "Download" and "Later" once per new version, and a status row in About ([desktop.md](desktop.md)).
- **`metro`, `metro-cache` and `metro-transform-worker` are pinned in `devDependencies` to the version `@expo/metro` wraps; bump them with the SDK.** Uniwind's Metro hooks patch Metro's `Graph`, and under Bun's isolated linker an unpinned peer resolves a different copy, so the patch would land on a Metro Expo never runs.

## How it works

- **Builds.** `bun run android` / `ios` (`expo run:*`) prebuilds into the gitignored `android/` and `ios/`; prerequisites are in `apps/mobile/README.md`.
- **Lifecycle.** `startShell` listens to NetInfo (`setNetworkOnline`), to `AppState` turning `active` (the desktop's `resume`, calling `reconnectOrRefresh`), and to `Linking` for incoming links.
- **Navigation.** `server-view.tsx` applies `decide()` (the desktop's rules) in `onShouldStartLoadWithRequest`; `about:` / `data:` / `blob:` / `javascript:` URLs always pass.
  - `onNavigationStateChange` covers in-page navigation to a sign-in path and remembers `lastPath`; `onOpenWindow` opens an allowed URL in the popup route.
  - The loading overlay stays until `onLoadEnd`; after `SLOW_LOAD_MS` it adds "Try again" (reload the webview), "Use a different server" and "Settings". The shell's own loading screen offers the same, with "Try again" running `route()`.
  - iOS gets `pullToRefreshEnabled`; react-native-webview has no Android equivalent.
  - The webview fills the screen below the status bar with no native chrome, a thin banner marks offline, and Android's back button walks the webview's history.
- **Downloads.** A cross-origin redirect out of `/api/drive/download` goes to the browser for Google hosts, as on the desktop. Otherwise:
  - iOS intercepts it and downloads it with `expo-file-system` into a fresh cache folder (`downloadAndShare`), then hands it to the share sheet. Relay drives redirect same-origin to a presigned `/api/drive/relay/*` URL, so they arrive through `onFileDownload` and take the same path.
  - Android leaves both to react-native-webview's own `DownloadListener`, which enqueues the system `DownloadManager` with the WebView's cookie and saves to Downloads with a notification; a cross-origin file the WebView can render is shown in place instead.
- **Settings.** `settingsFrom` validates per key with zod, falling back to the current value; `textZoom` is Android-only. The setup, sign-in and offline screens link to Settings too. Server, sign-out, clear cache (`clearCache()`), reset (native confirm) and About (version, build, Expo SDK, share the log) mirror the desktop panels.
- **Storage.** Server, `lastPath`, the pending login and settings live together in one `expo-secure-store` entry (`metis.config`), read synchronously once and then kept in memory like the desktop's `config.json`.
- **Look.**
  - The desktop shell's neutral palette (`@metis/ui`'s default tokens) is redrawn as the `@variant light` / `dark` block in `global.css` and follows the system theme.
  - `MetisMark` is redrawn with `react-native-svg`; the app icons are rendered from the web app's `icon.svg` ([ui.md](ui.md)).
  - DM Sans (400/500/600) and DM Mono come from `@expo-google-fonts/*` through the `expo-font` config plugin under one family name each, so `font-medium` / `font-semibold` pick real faces on both platforms.

## Deliberate limits

- **Print opens its page in the popup route without a print dialog**: react-native-webview has no `window.print()` handler. View original opens there in full.
- **The desktop-only settings (tray, autostart, start minimized, hardware acceleration, zoom, download folder) have no mobile counterpart.**
- **iOS has no update check**, because it has no published build ([downloads.md](downloads.md)).
