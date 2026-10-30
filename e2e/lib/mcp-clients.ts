import { z } from "zod";

export const TOOL_GROUPS = [
  "reads",
  "mail",
  "inbox",
  "labels",
  "drive",
  "calendar",
  "workflows",
  "account",
] as const;

export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const CHECK_CLIENTS = ["checks-1", "checks-2", "checks-3", "checks-4"] as const;

export const OWNER_CLIENTS = [...TOOL_GROUPS, ...CHECK_CLIENTS, "defaults"] as const;

export type OwnerClient = (typeof OWNER_CLIENTS)[number];

export const ALL_TOOLS_ON: ReadonlySet<OwnerClient> = new Set([...TOOL_GROUPS, ...CHECK_CLIENTS]);

export const MCP_CLIENT_REDIRECT = "http://127.0.0.1:47801/callback";

export type SeededClientPreset =
  | "claude-desktop"
  | "codex"
  | "cursor-desktop"
  | "vscode"
  | "custom";

export const CLIENT_PROFILES: Record<
  OwnerClient | "member",
  { label: string; preset: SeededClientPreset }
> = {
  reads: { label: "Claude Desktop", preset: "claude-desktop" },
  mail: { label: "Mail triage", preset: "custom" },
  inbox: { label: "Lumen", preset: "custom" },
  labels: { label: "Label sync", preset: "custom" },
  drive: { label: "Cursor", preset: "cursor-desktop" },
  calendar: { label: "Scheduling assistant", preset: "custom" },
  workflows: { label: "Codex", preset: "codex" },
  account: { label: "Hearth", preset: "custom" },
  "checks-1": { label: "VS Code", preset: "vscode" },
  "checks-2": { label: "Studio wiki", preset: "custom" },
  "checks-3": { label: "Paperweight", preset: "custom" },
  "checks-4": { label: "Weekly report", preset: "custom" },
  defaults: { label: "Tandem", preset: "custom" },
  member: { label: "Claude Desktop", preset: "claude-desktop" },
};

export const seededMcpClientSchema = z.object({
  clientId: z.string(),
  token: z.string(),
});
export type SeededMcpClient = z.infer<typeof seededMcpClientSchema>;

export const ownerClientsSchema = z.record(z.enum(OWNER_CLIENTS), seededMcpClientSchema);

export const memberEnrollmentSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
  totpURI: z.string(),
  mcpClient: seededMcpClientSchema,
});
export type MemberEnrollment = z.infer<typeof memberEnrollmentSchema>;
