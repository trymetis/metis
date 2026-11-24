import path from "node:path";

import { parseDeepLink, SCHEME, USER_AGENT_TOKEN } from "@metis/shell-core/links";
import { decide, parse } from "@metis/shell-core/navigation";
import { isRestorablePath, normalizeServer } from "@metis/shell-core/store";
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  dialog,
  session as electronSession,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  net,
  powerMonitor,
  shell,
} from "electron";

import {
  beginLogin,
  checkServer,
  completeLogin,
  connectTicketUrl,
  hasSession,
  StaleLoginError,
  signOut,
} from "./auth";
import { applyAutostart, launchedHidden } from "./autostart";
import { handleDownloads } from "./downloads";
import { findDeepLink } from "./links";
import { log, logFile, urlPath } from "./log";
import { attachNavigation } from "./navigation";
import { DEFAULT_SETTINGS, MAX_ZOOM, MIN_ZOOM, readSettings, writeSettings } from "./settings";
import type { OfflineReason, Settings, SettingsPayload, SettingsSection } from "./settings-types";
import { readLastPath, readServer, resetStore, writeLastPath, writeServer } from "./store";
import { hasTray, setTray } from "./tray";
import {
  checkForUpdates,
  downloadUpdate,
  markAnnounced,
  scheduleUpdateChecks,
  updateStatus,
} from "./update";

const PARTITION = "persist:metis-suite";
const HOME_PATH = "/w";
const BACKGROUND = "#0a0a0a";
const LIGHT_BACKGROUND = "#ffffff";
const APP_PATH = app.getAppPath();
const ICON = path.join(APP_PATH, "static", "icon.png");
const PRELOAD = path.join(APP_PATH, "dist", "preload.js");
const ZOOM_STEP = 0.1;
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write", "fullscreen", "notifications"]);

const NETWORK_ERRORS = new Set([
  -7, -15, -21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -137, -324,
]);

const DEVTOOLS = !app.isPackaged;
const DEBUGGING_SWITCHES = ["remote-debugging-port", "remote-debugging-pipe"];

if (!DEVTOOLS) {
  for (const name of DEBUGGING_SWITCHES) {
    if (app.commandLine.hasSwitch(name)) app.commandLine.removeSwitch(name);
  }
}

const launchHardwareAcceleration = readSettings().hardwareAcceleration;
if (!launchHardwareAcceleration) app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let queuedLink: string | null = null;
let quitting = false;
let networkOnline = true;
let offlineShown: OfflineReason | null = null;
let reconnecting = false;
let lastServerPath: string | null = null;

function themeBackground(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND : LIGHT_BACKGROUND;
}

function applyThemeBackground() {
  for (const target of [mainWindow, settingsWindow]) {
    if (target && !target.isDestroyed()) {
      target.setBackgroundColor(themeBackground());
    }
  }
}

function appSession() {
  return electronSession.fromPartition(PARTITION);
}

function webPreferences(): BrowserWindowConstructorOptions["webPreferences"] {
  return {
    partition: PARTITION,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: true,
    devTools: DEVTOOLS,
  };
}

function rendererPage(page: string): string {
  return path.join(APP_PATH, "dist", "renderer", `${page}.html`);
}

function isAborted(error: unknown): boolean {
  const { code, errno } = (error ?? {}) as { code?: unknown; errno?: unknown };
  return code === "ERR_ABORTED" || errno === -3;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNetworkError(error: unknown): boolean {
  const { errno } = (error ?? {}) as { errno?: unknown };
  return typeof errno === "number" && NETWORK_ERRORS.has(errno);
}

function showOffline(trigger: string) {
  const reason: OfflineReason = net.isOnline() ? "unreachable" : "offline";
  if (offlineShown === reason) return;
  offlineShown = reason;
  log("showing offline screen", { trigger, reason });
  window()
    .loadFile(rendererPage("offline"), { query: { reason } })
    .catch((error: unknown) => {
      if (!isAborted(error)) {
        log("offline screen failed", { message: errorText(error) });
      }
    });
}

async function reconnect(trigger: string): Promise<{ ok: boolean; reason?: OfflineReason }> {
  if (!offlineShown) return { ok: true };
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return { ok: true };
  }
  if (!net.isOnline()) {
    log("reconnect skipped while offline", { trigger });
    return { ok: false, reason: "offline" };
  }
  if (reconnecting) return { ok: false, reason: "unreachable" };
  reconnecting = true;
  log("reconnect attempt", { trigger });
  try {
    const signedIn = await hasSession(appSession(), server);
    log("server answered", { trigger, signedIn });
    if (signedIn) await showServer(lastServerPath ?? HOME_PATH);
    else showLocal("signin");
    return { ok: true };
  } catch (error) {
    log("server still unreachable", { trigger, message: errorText(error) });
    return { ok: false, reason: "unreachable" };
  } finally {
    reconnecting = false;
  }
}

async function reconnectOrRefresh(trigger: string) {
  const result = await reconnect(trigger);
  if (!result.ok) showOffline(trigger);
}

function updateTitle() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const title = mainWindow.webContents.getTitle() || "Metis Suite";
  mainWindow.setTitle(networkOnline ? title : `${title} — offline`);
}

function rememberServerPage(raw: string) {
  const server = readServer();
  try {
    const url = new URL(raw);
    if (url.origin !== server || url.pathname === "/") return;
    lastServerPath = `${url.pathname}${url.search}`;
    if (readSettings().restoreLastPage && isRestorablePath(lastServerPath)) {
      writeLastPath(lastServerPath);
    }
  } catch {
    return;
  }
}

function showLocal(page: "setup" | "signin", query: Record<string, string> = {}) {
  log("showing local screen", { page, ...query });
  window()
    .loadFile(rendererPage(page), { query })
    .catch((error: unknown) => {
      if (!isAborted(error)) {
        log("local screen failed", { page, message: errorText(error) });
      }
    });
}

type LoadingStatus = "opening" | "signing-in";

function loadingStatusShown(): LoadingStatus | null {
  try {
    const url = new URL(window().webContents.getURL());
    if (url.protocol !== "file:" || !url.pathname.endsWith("/loading.html")) {
      return null;
    }
    return url.searchParams.get("status") === "signing-in" ? "signing-in" : "opening";
  } catch {
    return null;
  }
}

async function showLoading(status: LoadingStatus) {
  if (loadingStatusShown() === status) return;
  try {
    await window().loadFile(rendererPage("loading"), { query: { status } });
  } catch (error) {
    if (!isAborted(error)) {
      log("loading screen failed", { message: errorText(error) });
    }
  }
}

async function showServer(pathname: string) {
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return;
  }
  await showLoading("opening");
  log("loading server page", { path: pathname });
  try {
    await window().loadURL(`${server}${pathname}`);
    log("server page loaded", { url: urlPath(window().webContents.getURL()) });
  } catch (error) {
    if (isAborted(error)) {
      log("server page load replaced", { path: pathname });
      return;
    }
    if (isNetworkError(error)) {
      showOffline("load-failed");
      return;
    }
    log("server page failed", { path: pathname, message: errorText(error) });
    showLocal("signin", {
      error: `Could not open ${server}: ${errorText(error)}`,
    });
  }
}

function startPath(): string {
  if (!readSettings().restoreLastPage) return HOME_PATH;
  return readLastPath() ?? HOME_PATH;
}

async function route() {
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return;
  }
  await showLoading("opening");
  try {
    const signedIn = await hasSession(appSession(), server);
    log("route", { signedIn });
    if (signedIn) await showServer(startPath());
    else showLocal("signin");
  } catch (error) {
    log("route failed", { message: errorText(error) });
    showOffline("start-up");
  }
}

async function isSignedIn(server: string): Promise<boolean> {
  try {
    return await hasSession(appSession(), server);
  } catch {
    return false;
  }
}

async function handleLink(raw: string, source: string): Promise<boolean> {
  const link = parseDeepLink(raw);
  const server = readServer();
  log("deep link received", {
    source,
    kind: link?.kind ?? "invalid",
    paired: Boolean(server),
  });
  if (!link || !server) return false;
  focus();

  if (link.kind === "open") {
    await showServer(link.path);
    return true;
  }

  await showLoading("signing-in");
  try {
    await completeLogin(appSession(), server, link.code, link.state);
    log("sign-in completed");
    await showServer(HOME_PATH);
  } catch (error) {
    if (error instanceof StaleLoginError && (await isSignedIn(server))) {
      log("stale sign-in link while already signed in");
      await showServer(HOME_PATH);
      return true;
    }
    log("sign-in failed", { message: errorText(error) });
    showLocal("signin", { error: errorText(error) });
  }
  return true;
}

async function connectInBrowser(url: string) {
  const server = readServer();
  if (!server) return;
  const target = new URL(url);
  try {
    const ticketUrl = await connectTicketUrl(
      appSession(),
      server,
      `${target.pathname}${target.search}`,
    );
    await shell.openExternal(ticketUrl);
  } catch (err) {
    dialog.showErrorBox(
      "Could not connect the account",
      err instanceof Error ? err.message : "Try again.",
    );
  }
}

async function signOutAndRoute() {
  await signOut(appSession(), readServer());
  writeLastPath(null);
  lastServerPath = null;
  focus();
  await route();
}

async function changeServer() {
  await signOut(appSession(), readServer());
  writeServer(null);
  lastServerPath = null;
  focus();
  showLocal("setup");
}

function clampZoom(factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(factor * 10) / 10));
}

function setZoom(factor: number) {
  const next = clampZoom(factor);
  writeSettings({ zoomFactor: next });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(next);
  }
}

function zoomBy(delta: number) {
  setZoom(readSettings().zoomFactor + delta);
}

function openAbout() {
  openSettings({ section: "about" });
}

function checkForUpdatesFromMenu() {
  openSettings({ section: "about", check: true });
}

function historyTarget(step: -1 | 1): number | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const history = mainWindow.webContents.navigationHistory;
  const server = readServer();
  const count = history.length();
  for (let index = history.getActiveIndex() + step; index >= 0 && index < count; index += step) {
    const url = parse(history.getEntryAtIndex(index).url);
    if (url && decide(url, server) === "allow") return index;
  }
  return null;
}

function navigateHistory(step: -1 | 1) {
  const index = historyTarget(step);
  if (index === null || !mainWindow) return;
  mainWindow.webContents.navigationHistory.goToIndex(index);
}

function applySettings(previous: Settings | null, next: Settings) {
  if (
    !previous ||
    previous.openAtLogin !== next.openAtLogin ||
    previous.startMinimized !== next.startMinimized
  ) {
    try {
      applyAutostart(next.openAtLogin, next.startMinimized);
    } catch (err) {
      console.error("[desktop] could not update autostart", err);
    }
  }
  if (previous?.restoreLastPage && !next.restoreLastPage) writeLastPath(null);
  setTray(next.closeToTray, {
    show: focus,
    settings: () => openSettings(),
    checkForUpdates: checkForUpdatesFromMenu,
    quit: () => {
      quitting = true;
      app.quit();
    },
  });
  if (!previous || previous.checkForUpdates !== next.checkForUpdates) {
    scheduleUpdateChecks(next.checkForUpdates, openAbout);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(next.zoomFactor);
  }
}

function createWindow(hidden = false): BrowserWindow {
  const created = new BrowserWindow({
    name: "main",
    windowStatePersistence: true,
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Metis Suite",
    show: false,
    backgroundColor: themeBackground(),
    icon: ICON,
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: { ...webPreferences(), preload: PRELOAD },
  });

  created.once("ready-to-show", () => {
    if (!hidden) {
      created.show();
    } else if (!hasTray()) {
      created.showInactive();
      created.minimize();
    }
  });

  attachNavigation(created.webContents, {
    server: readServer,
    signInRequired: (url) => {
      log("server asked for sign-in", { url: urlPath(url) });
      showLocal("signin");
    },
    connect: (url) => void connectInBrowser(url),
    settings: () => openSettings(),
    childWindowOptions: () => ({
      parent: created,
      autoHideMenuBar: true,
      webPreferences: webPreferences(),
    }),
  });

  created.webContents.on("did-finish-load", () => {
    created.webContents.setZoomFactor(readSettings().zoomFactor);
  });
  created.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    log("main frame load failed", { code, description, url: urlPath(url) });
    if (NETWORK_ERRORS.has(code)) showOffline("load-failed");
  });
  created.webContents.on("did-navigate", (_event, url) => {
    if (!url.startsWith("file:") || !url.includes("/offline.html")) {
      offlineShown = null;
    }
    rememberServerPage(url);
  });
  created.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) rememberServerPage(url);
  });
  created.on("page-title-updated", (event, title) => {
    if (networkOnline) return;
    event.preventDefault();
    created.setTitle(`${title} — offline`);
  });
  created.webContents.on("zoom-changed", (_event, direction) => {
    zoomBy(direction === "in" ? ZOOM_STEP : -ZOOM_STEP);
  });
  created.on("app-command", (_event, command) => {
    if (command === "browser-backward") navigateHistory(-1);
    else if (command === "browser-forward") navigateHistory(1);
  });
  created.on("swipe", (_event, direction) => {
    if (direction === "left") navigateHistory(-1);
    else if (direction === "right") navigateHistory(1);
  });

  created.on("close", (event) => {
    if (quitting || !readSettings().closeToTray || !hasTray()) return;
    event.preventDefault();
    created.hide();
  });
  created.on("closed", () => {
    if (mainWindow === created) mainWindow = null;
  });
  mainWindow = created;
  return created;
}

function window(): BrowserWindow {
  return mainWindow ?? createWindow();
}

function focus() {
  const target = window();
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
}

function settingsQuery(options: { section?: SettingsSection; check?: boolean }) {
  const query: Record<string, string> = {};
  if (options.section) query.section = options.section;
  if (options.check) query.check = "1";
  return query;
}

function openSettings(options: { section?: SettingsSection; check?: boolean } = {}) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (options.section) {
      void settingsWindow.loadFile(rendererPage("settings"), { query: settingsQuery(options) });
    }
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const created = new BrowserWindow({
    name: "settings",
    windowStatePersistence: true,
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    title: "Settings",
    show: false,
    backgroundColor: themeBackground(),
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: DEVTOOLS,
      preload: PRELOAD,
    },
  });
  if (process.platform !== "darwin") created.setMenu(null);
  created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  created.webContents.on("will-navigate", (event) => event.preventDefault());
  created.once("ready-to-show", () => created.show());
  created.on("closed", () => {
    if (settingsWindow === created) settingsWindow = null;
  });
  void created.loadFile(rendererPage("settings"), { query: settingsQuery(options) });
  settingsWindow = created;
}

function closeSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
}

function fromLocalPage(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url.startsWith("file:") === true;
}

function settingsPayload(): SettingsPayload {
  const settings = readSettings();
  return {
    settings,
    platform: process.platform,
    server: readServer(),
    restartRequired: settings.hardwareAcceleration !== launchHardwareAcceleration,
    defaultDownloadFolder: app.getPath("downloads"),
    logFile: logFile(),
    update: updateStatus(),
    about: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    },
  };
}

async function resetApp() {
  const parent = settingsWindow ?? mainWindow;
  const options = {
    type: "warning" as const,
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Reset Metis Suite?",
    detail: "This signs you out, forgets the server and restores every setting to its default.",
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (response !== 0) return false;

  const previous = readSettings();
  await signOut(appSession(), readServer());
  await appSession().clearCache();
  resetStore();
  applySettings(previous, DEFAULT_SETTINGS);
  closeSettings();
  focus();
  showLocal("setup");
  return true;
}

function registerIpc() {
  ipcMain.handle("metis:info", (event) => {
    if (!fromLocalPage(event)) return null;
    return { server: readServer() };
  });

  ipcMain.handle("metis:set-server", async (event, input: unknown) => {
    if (!fromLocalPage(event)) return { ok: false };
    const server = typeof input === "string" ? normalizeServer(input) : null;
    if (!server) {
      return {
        ok: false,
        error: "Enter your server's address, for example mail.example.com",
      };
    }
    if (!(await checkServer(appSession(), server))) {
      return { ok: false, error: `No Metis server answered at ${server}.` };
    }
    writeServer(server);
    await route();
    return { ok: true };
  });

  ipcMain.handle("metis:sign-in", async (event) => {
    if (!fromLocalPage(event)) return;
    const server = readServer();
    if (!server) return;
    await shell.openExternal(beginLogin(server));
  });

  ipcMain.handle("metis:change-server", async (event) => {
    if (!fromLocalPage(event)) return;
    closeSettings();
    await changeServer();
  });

  ipcMain.handle("metis:retry-connection", async (event) => {
    if (!fromLocalPage(event)) return { ok: false };
    return reconnect("button");
  });

  ipcMain.handle("metis:reopen", async (event) => {
    if (!fromLocalPage(event)) return;
    log("reopen from loading screen");
    await route();
  });

  ipcMain.on("metis:history", (event, direction: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    if (process.platform !== "darwin") return;
    if (direction === "back") navigateHistory(-1);
    else if (direction === "forward") navigateHistory(1);
  });

  ipcMain.on("metis:network", (event, online: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    if (typeof online !== "boolean" || online === networkOnline) return;
    networkOnline = online;
    log("network changed", { online });
    updateTitle();
    if (online) void reconnectOrRefresh("online");
  });

  ipcMain.handle("metis:sign-out", async (event) => {
    if (!fromLocalPage(event)) return;
    closeSettings();
    await signOutAndRoute();
  });

  ipcMain.handle("metis:open-settings", (event) => {
    if (!fromLocalPage(event)) return;
    openSettings();
  });

  ipcMain.handle("metis:get-settings", (event) => {
    if (!fromLocalPage(event)) return null;
    return settingsPayload();
  });

  ipcMain.handle("metis:update-settings", (event, patch: unknown) => {
    if (!fromLocalPage(event)) return null;
    const previous = readSettings();
    const next = writeSettings(patch && typeof patch === "object" ? patch : {});
    applySettings(previous, next);
    return settingsPayload();
  });

  ipcMain.handle("metis:choose-download-folder", async (event) => {
    if (!fromLocalPage(event)) return null;
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Choose a download folder",
      defaultPath: readSettings().downloadFolder ?? app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"] as Array<
        "openDirectory" | "createDirectory"
      >,
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const folder = result.filePaths[0];
    if (result.canceled || !folder) return settingsPayload();
    writeSettings({ downloadMode: "folder", downloadFolder: folder });
    return settingsPayload();
  });

  ipcMain.handle("metis:check-for-updates", async (event) => {
    if (!fromLocalPage(event)) return null;
    markAnnounced(await checkForUpdates());
    return settingsPayload();
  });

  ipcMain.handle("metis:download-update", (event) => {
    if (!fromLocalPage(event)) return;
    downloadUpdate();
  });

  ipcMain.handle("metis:show-log", (event) => {
    if (!fromLocalPage(event)) return;
    log("log file opened from settings");
    shell.showItemInFolder(logFile());
  });

  ipcMain.handle("metis:clear-cache", async (event) => {
    if (!fromLocalPage(event)) return false;
    const session = appSession();
    await session.clearCache();
    await session.clearStorageData({ storages: ["indexdb", "filesystem"] });
    return true;
  });

  ipcMain.handle("metis:reset-app", async (event) => {
    if (!fromLocalPage(event)) return false;
    return resetApp();
  });

  ipcMain.handle("metis:restart", (event) => {
    if (!fromLocalPage(event)) return;
    quitting = true;
    app.relaunch();
    app.exit(0);
  });
}

function guardPermissions() {
  appSession().setPermissionRequestHandler((contents, permission, callback) => {
    let origin: string | null = null;
    try {
      origin = new URL(contents.getURL()).origin;
    } catch {
      origin = null;
    }
    callback(origin !== null && origin === readServer() && ALLOWED_PERMISSIONS.has(permission));
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: () => openSettings(),
  };
  const updatesItem: MenuItemConstructorOptions = {
    label: "Check for updates…",
    click: checkForUpdatesFromMenu,
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settingsItem,
              updatesItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "Home", click: () => void showServer(HOME_PATH) },
        ...(isMac ? [] : [settingsItem, updatesItem]),
        { type: "separator" },
        { label: "Sign out", click: () => void signOutAndRoute() },
        { label: "Change server…", click: () => void changeServer() },
        { type: "separator" },
        isMac
          ? { role: "close" }
          : {
              label: "Quit",
              accelerator: "CmdOrCtrl+Q",
              click: () => {
                quitting = true;
                app.quit();
              },
            },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Back",
          accelerator: isMac ? "Cmd+[" : "Alt+Left",
          click: () => navigateHistory(-1),
        },
        {
          label: "Forward",
          accelerator: isMac ? "Cmd+]" : "Alt+Right",
          click: () => navigateHistory(1),
        },
        { type: "separator" },
        { role: "reload" },
        ...(DEVTOOLS ? [{ role: "toggleDevTools" } satisfies MenuItemConstructorOptions] : []),
        { type: "separator" },
        {
          label: "Actual Size",
          accelerator: "CmdOrCtrl+0",
          click: () => setZoom(1),
        },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+=",
          click: () => zoomBy(ZOOM_STEP),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => zoomBy(-ZOOM_STEP),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(SCHEME);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = findDeepLink(argv);
    log("second instance", { hasLink: Boolean(link), args: argv.length });
    if (link) void handleLink(link, "second-instance");
    else focus();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    log("open-url", { ready: app.isReady() });
    if (app.isReady()) void handleLink(url, "open-url");
    else queuedLink = url;
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (mainWindow) focus();
    else void route();
  });

  void app.whenReady().then(async () => {
    const settings = readSettings();
    const session = appSession();
    session.setUserAgent(`${session.getUserAgent()} ${USER_AGENT_TOKEN}/${app.getVersion()}`);
    registerIpc();
    guardPermissions();
    buildMenu();
    applySettings(null, settings);
    createWindow(launchedHidden(settings.startMinimized));
    handleDownloads(appSession(), () => mainWindow);
    networkOnline = net.isOnline();
    nativeTheme.on("updated", applyThemeBackground);
    powerMonitor.on("resume", () => {
      log("system resumed");
      void reconnectOrRefresh("resume");
    });
    const link = queuedLink ?? findDeepLink(process.argv);
    queuedLink = null;
    log("app started", {
      version: app.getVersion(),
      launchedWithLink: Boolean(link),
    });
    if (!link || !(await handleLink(link, "launch"))) await route();
  });
}
