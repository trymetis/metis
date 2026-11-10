export const WORKSPACE_SETTINGS_PAGES = [
  "general",
  "members",
  "mailboxes",
  "signatures",
  "calendars",
  "drives",
  "contacts",
  "activity",
] as const;

export type WorkspaceSettingsPage = (typeof WORKSPACE_SETTINGS_PAGES)[number];
