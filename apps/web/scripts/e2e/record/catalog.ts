import { APPROVAL_CHAT, WORKSPACE_CHATS } from "@metis/e2e/lib/llm-scenarios";
import { z } from "zod";

export const scenarioSchema = z.object({
  id: z.string(),
  step: z.enum(["world", "mail", "smart-replies", "chat", "workflows", "late-arrival", "mcp"]),
  arg: z.string().optional(),
  from: z.string().nullable(),
  reads: z.array(z.string()),
  writes: z.array(z.string()),
  slots: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  timeoutMs: z.number(),
  tables: z.array(z.string()).readonly(),
  mastra: z.boolean(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export type Step = Scenario["step"];

export const SLOTS: Record<string, number> = { "ftp-explicit": 1 };

const MINUTE = 60_000;
const USAGE = ["ai_usage"] as const;
const WORKFLOW_TABLES = [
  "ai_usage",
  "workflow_event",
  "workflow_run",
  "workflow_step_run",
  "workflow_wait",
] as const;
const EXPLICIT_FTP_DRIVES = new Set(["ftps", "ftp"]);
const INBOX = "imap:inbox";
const RECORDED_FOLDERS = ["sent", "drafts", "archive", "spam", "trash"] as const;

function scenario(fields: Pick<Scenario, "id" | "step"> & Partial<Scenario>): Scenario {
  return {
    from: "mail:decision",
    reads: [INBOX],
    writes: [],
    slots: [],
    env: {},
    timeoutMs: 20 * MINUTE,
    tables: USAGE,
    mastra: false,
    ...fields,
  };
}

export function catalog(driveKinds: string[]): Scenario[] {
  const drives = driveKinds.map((kind) => `drive:${kind}`);
  const approvalDrive = `drive:${APPROVAL_CHAT.drive}`;
  const workspaceChat = (arg: string, extra: Partial<Scenario> = {}): Scenario =>
    scenario({
      id: `chat:workspace:${arg}`,
      step: "chat",
      arg: `workspace:${arg}`,
      reads: [INBOX, ...drives],
      slots: ["ftp-explicit"],
      timeoutMs: 40 * MINUTE,
      ...extra,
    });

  return [
    scenario({
      id: "world",
      step: "world",
      from: null,
      reads: [],
      writes: [INBOX, ...drives],
      timeoutMs: 10 * MINUTE,
      tables: ["mail_mute", "mail_read_later"],
    }),
    scenario({
      id: "mail:decision",
      step: "mail",
      from: "world",
      timeoutMs: 30 * MINUTE,
    }),
    ...RECORDED_FOLDERS.map((folder) =>
      scenario({
        id: `mail:${folder}`,
        step: "mail",
        arg: folder,
        timeoutMs: 30 * MINUTE,
      }),
    ),
    scenario({ id: "mail:gated", step: "mail", arg: "gated" }),
    workspaceChat("stored", { mastra: true }),
    scenario({
      id: "mail:llm",
      step: "mail",
      from: "world",
      env: { METIS_DECISION_CLASSIFIER: "false" },
      timeoutMs: 30 * MINUTE,
    }),
    scenario({ id: "smart-replies", step: "smart-replies", from: "world" }),
    scenario({
      id: "chat:calendar",
      step: "chat",
      arg: "calendar",
      from: "world",
      reads: [],
      timeoutMs: 30 * MINUTE,
    }),
    ...driveKinds.map((kind) =>
      scenario({
        id: `chat:drive:${kind}`,
        step: "chat",
        arg: `drive:${kind}`,
        from: "world",
        reads: [`drive:${kind}`],
        slots: EXPLICIT_FTP_DRIVES.has(kind) ? ["ftp-explicit"] : [],
        timeoutMs: 30 * MINUTE,
      }),
    ),
    workspaceChat("live"),
    scenario({
      id: "chat:mailbox",
      step: "chat",
      arg: "mailbox",
      timeoutMs: 30 * MINUTE,
    }),
    ...WORKSPACE_CHATS.liveChips.map((_, index) => workspaceChat(`chip-${index + 1}`)),
    scenario({ id: "workflows", step: "workflows", tables: WORKFLOW_TABLES }),
    scenario({
      id: "mcp:summarizeThread",
      step: "mcp",
      arg: "summarizeThread",
    }),
    scenario({
      id: "mcp:previewDecision",
      step: "mcp",
      arg: "previewDecision",
    }),
    workspaceChat("approval", {
      reads: [INBOX, ...drives.filter((d) => d !== approvalDrive)],
      writes: [approvalDrive],
    }),
    scenario({
      id: "late-arrival",
      step: "late-arrival",
      reads: [],
      writes: [INBOX],
    }),
  ];
}

export function fragmentName(id: string): string {
  return `${id.replaceAll(":", "-")}.sql`;
}

export function matches(id: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`).test(id),
  );
}
