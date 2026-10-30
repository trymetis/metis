import { REBRAND_FOLDER } from "@metis/e2e/lib/cast";
import { LATE_ARRIVAL_WORKFLOW } from "@metis/e2e/lib/late-arrival";
import {
  AGENT_WORKFLOW,
  AGGREGATE_WORKFLOW,
  AI_WORKFLOW,
  APPROVAL_WORKFLOW,
  BEFORE_SEND_BCC,
  BEFORE_SEND_WORKFLOW,
  CALENDAR_WORKFLOW,
  CALLED_WORKFLOW,
  CALLER_WORKFLOW,
  DELAY_WORKFLOW,
  DRIVE_WORKFLOW,
  ERROR_WORKFLOW,
  LOOP_WORKFLOW,
  RUN_FAILED_WORKFLOW,
  SWITCH_WORKFLOW,
  WEBHOOK_LABEL,
  WEBHOOK_WORKFLOW,
} from "@metis/e2e/lib/workflow-seeds";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Binding =
  | { kind: "literal"; value: Json }
  | { kind: "template"; text: string }
  | { kind: "expr"; cel: string };

interface SeededNode {
  id: string;
  step: string;
  position: { x: number; y: number };
  params: Record<string, Binding>;
  onError?: "branch";
}

interface SeededWorkflow {
  name: string;
  enabled: boolean;
  graph: {
    version: 2;
    nodes: SeededNode[];
    edges: {
      id: string;
      source: string;
      target: string;
      sourceHandle: string;
      targetHandle?: string;
    }[];
    settings: Record<string, never>;
  };
}

const STEP_X = 352;
const LANE_Y = 200;

function at(step: number, lane = 0) {
  return { x: step * STEP_X, y: lane * LANE_Y };
}

const lit = (value: Json): Binding => ({ kind: "literal", value });
const cel = (text: string): Binding => ({ kind: "expr", cel: text });

function node(
  id: string,
  step: string,
  position: { x: number; y: number },
  params: Record<string, Binding> = {},
): SeededNode {
  return { id, step, position, params };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "out",
  targetHandle?: string,
) {
  return { id, source, target, sourceHandle, ...(targetHandle ? { targetHandle } : {}) };
}

function graph(nodes: SeededNode[], edges: ReturnType<typeof edge>[]): SeededWorkflow["graph"] {
  return { version: 2, nodes, edges, settings: {} };
}

function inbox(mailboxId: string, row: number, limit: number) {
  return node("inbox", "mail.list", at(row), {
    mailbox: lit(mailboxId),
    folder: lit("inbox"),
    limit: lit(limit),
  });
}

function contains(id: string, field: "subject" | "from", value: string, row: number, lane = 0) {
  return node(id, "logic.filter", at(row, lane), {
    condition: cel(`lower(item.${field}).contains(${JSON.stringify(value.toLowerCase())})`),
  });
}

function label(id: string, key: string, row: number, lane = 0) {
  return node(id, "mail.label", at(row, lane), {
    message: cel("item"),
    label: lit(key),
    action: lit("add"),
  });
}

const manual = (row = 0) => node("manual", "trigger.manual", at(row));

export interface SeedIds {
  mailboxId: string;
  userId: string;
  calendarId: string;
  driveId: string;
  calledWorkflowId: string;
}

const assign = (name: string, text: string) => ({ name, value: { kind: "expr", cel: text } });

export function calledWorkflow(): SeededWorkflow {
  return {
    name: CALLED_WORKFLOW,
    enabled: true,
    graph: graph(
      [
        node("called", "trigger.call", at(0), {
          inputs: lit([{ name: "address", type: "text", required: true }]),
        }),
        node("answer", "flow.return", at(1), {
          fields: lit([assign("domain", "domain(trigger.inputs.address)")]),
        }),
      ],
      [edge("e1", "called", "answer")],
    ),
  };
}

export function seededWorkflows(ids: SeedIds): SeededWorkflow[] {
  const { mailboxId, userId, calendarId, driveId, calledWorkflowId } = ids;
  return [
    {
      name: "Label rebrand mail",
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 50),
          contains("rebrand", "subject", "Rebrand", 2),
          label("label", "custom:clients", 3),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "rebrand"),
          edge("e3", "rebrand", "label"),
        ],
      ),
    },
    {
      name: "Morning newsletter sweep",
      enabled: true,
      graph: graph(
        [
          node("daily", "trigger.schedule", at(0), {
            cron: lit("0 7 * * *"),
            timezone: lit("Etc/UTC"),
          }),
          inbox(mailboxId, 1, 20),
          contains("digest", "subject", "digest", 2),
          label("label", "newsletter", 3),
        ],
        [
          edge("e1", "daily", "inbox"),
          edge("e2", "inbox", "digest"),
          edge("e3", "digest", "label"),
        ],
      ),
    },
    {
      name: "File new mail from Raj",
      enabled: true,
      graph: graph(
        [
          node("arrives", "trigger.mail.received", at(0), {
            mailbox: lit(mailboxId),
            folder: lit("inbox"),
          }),
          contains("raj", "from", "raj@", 1),
          label("label", "work", 2),
        ],
        [edge("e1", "arrives", "raj"), edge("e2", "raj", "label")],
      ),
    },
    {
      name: "Collect rebrand and Codeyard mail",
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 50),
          contains("rebrand", "subject", "Rebrand", 2, 0),
          contains("codeyard", "from", "codeyard", 2, 1),
          node("append", "logic.merge", at(3)),
          label("label", "work", 4),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "rebrand"),
          edge("e3", "inbox", "codeyard"),
          edge("e4", "rebrand", "append", "out", "in:0"),
          edge("e5", "codeyard", "append", "out", "in:1"),
          edge("e6", "append", "label"),
        ],
      ),
    },
    {
      name: "Label orders once both checks finish",
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 50),
          contains("order", "subject", "order", 2, 0),
          contains("debit", "subject", "debited", 2, 1),
          node("join", "logic.join", at(3)),
          label("label", "transactions", 4),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "order"),
          edge("e3", "inbox", "debit"),
          edge("e4", "order", "join", "out", "in:0"),
          edge("e5", "debit", "join", "out", "in:1"),
          edge("e6", "join", "label"),
        ],
      ),
    },
    {
      name: LATE_ARRIVAL_WORKFLOW,
      enabled: false,
      graph: graph(
        [
          node("arrives", "trigger.mail.received", at(0), {
            mailbox: lit(mailboxId),
            folder: lit("inbox"),
          }),
          node("ask", "ai.ask", at(1), {
            subject: cel("item"),
            include: lit(["from", "subject", "snippet"]),
            questions: lit([
              {
                id: "q1",
                type: "boolean",
                instructions: "Does this email ask the reader to do something?",
              },
            ]),
          }),
          node("act", "ai.branch", at(2)),
          label("todo", "action_required", 3, 0),
          label("fyi", "updates", 3, 1),
        ],
        [
          edge("e1", "arrives", "ask"),
          edge("e2", "ask", "act", "q:q1"),
          edge("e3", "act", "todo", "yes"),
          edge("e4", "act", "fyi", "no"),
        ],
      ),
    },
    {
      name: "Triage with the decision model",
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 10),
          node("ask", "ai.ask", at(2), {
            subject: cel("item"),
            include: lit(["from", "subject", "snippet"]),
            questions: lit([
              {
                id: "q1",
                type: "boolean",
                instructions: "Does this email ask the reader to do something?",
              },
              {
                id: "q2",
                type: "choice",
                instructions: "Which team should handle this email?",
                options: [
                  { id: "o1", name: "Design", description: "Brand, layout, assets" },
                  { id: "o2", name: "Finance", description: "Payments, orders, accounts" },
                  { id: "o3", name: "Engineering", description: "Code, accounts, security" },
                ],
                other: true,
              },
              {
                id: "q3",
                type: "score",
                instructions: "How urgent is this email?",
                levels: [
                  { id: "l0", name: "Low" },
                  { id: "l1", name: "Medium" },
                  { id: "l2", name: "High" },
                ],
              },
            ]),
          }),
          node("act", "ai.branch", at(3, 0)),
          node("team", "ai.branch", at(3, 1)),
          node("urgency", "ai.branch", at(3, 2)),
          label("todo", "action_required", 4, 0),
          label("finance", "transactions", 4, 1),
          label("urgent", "work", 4, 2),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "ask"),
          edge("e3", "ask", "act", "q:q1"),
          edge("e4", "ask", "team", "q:q2"),
          edge("e5", "ask", "urgency", "q:q3"),
          edge("e6", "act", "todo", "yes"),
          edge("e7", "team", "finance", "opt:o2"),
          edge("e8", "urgency", "urgent", "lvl:l2"),
        ],
      ),
    },
    {
      name: APPROVAL_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 1),
          node("approve", "flow.approval", at(2), {
            approvers: lit([userId]),
            message: { kind: "literal", value: "Star the newest message?" },
            amount: lit(7),
            unit: lit("days"),
          }),
          node("star", "mail.star", at(3), { message: cel("item"), starred: lit(true) }),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "approve"),
          edge("e3", "approve", "star", "approved"),
        ],
      ),
    },
    {
      name: WEBHOOK_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          node("hook", "trigger.webhook", at(0), {
            body: lit([{ name: "subject", type: "text", required: true }]),
            auth: lit("secret"),
          }),
          node("find", "mail.search", at(1), {
            mailbox: lit(mailboxId),
            query: cel("trigger.body.subject"),
            limit: lit(5),
          }),
          label("label", WEBHOOK_LABEL, 2),
        ],
        [edge("e1", "hook", "find"), edge("e2", "find", "label")],
      ),
    },
    {
      name: CALLER_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 1),
          node("describe", "flow.call", at(2), {
            workflow: lit(calledWorkflowId),
            inputs: lit([assign("address", "item.from")]),
          }),
        ],
        [edge("e1", "manual", "inbox"), edge("e2", "inbox", "describe")],
      ),
    },
    {
      name: CALENDAR_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          node("created", "trigger.calendar.created", at(0), { calendar: lit(calendarId) }),
          node("note", "logic.set", at(1), { fields: lit([assign("title", "item.title")]) }),
        ],
        [edge("e1", "created", "note")],
      ),
    },
    {
      name: DRIVE_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          node("added", "trigger.drive.added", at(0), {
            drive: lit(driveId),
            folder: lit(REBRAND_FOLDER.replace(/\/$/, "")),
          }),
          node("read", "drive.readText", at(1), { file: cel("item") }),
        ],
        [edge("e1", "added", "read")],
      ),
    },
    {
      name: SWITCH_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 20),
          node("route", "logic.switch", at(2), {
            cases: lit([
              { id: "rebrand", name: "Rebrand", when: 'lower(item.subject).contains("rebrand")' },
              { id: "order", name: "Orders", when: 'lower(item.subject).contains("order")' },
            ]),
          }),
          label("design", "work", 3, 0),
          label("orders", "transactions", 3, 1),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "route"),
          edge("e3", "route", "design", "case:rebrand"),
          edge("e4", "route", "orders", "case:order"),
        ],
      ),
    },
    {
      name: DELAY_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 1),
          node("later", "flow.delay", at(2), { amount: lit(1), unit: lit("days") }),
          node("star", "mail.star", at(3), { message: cel("item"), starred: lit(true) }),
        ],
        [edge("e1", "manual", "inbox"), edge("e2", "inbox", "later"), edge("e3", "later", "star")],
      ),
    },
    {
      name: AGGREGATE_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 20),
          node("all", "logic.aggregate", at(2)),
          node("count", "logic.set", at(3), { fields: lit([assign("count", "item.count")]) }),
        ],
        [edge("e1", "manual", "inbox"), edge("e2", "inbox", "all"), edge("e3", "all", "count")],
      ),
    },
    {
      name: ERROR_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          {
            ...node("fetch", "mail.get", at(1), {
              mailbox: lit(mailboxId),
              id: lit("no-such-message"),
            }),
            onError: "branch",
          },
          node("note", "logic.set", at(2), { fields: lit([assign("failed", "true")]) }),
        ],
        [edge("e1", "manual", "fetch"), edge("e2", "fetch", "note", "error")],
      ),
    },
    {
      name: RUN_FAILED_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          node("failed", "trigger.app.runFailed", at(0)),
          node("note", "logic.set", at(1), {
            fields: lit([assign("workflow", "trigger.workflow")]),
          }),
        ],
        [edge("e1", "failed", "note")],
      ),
    },
    {
      name: LOOP_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 3),
          node("each", "flow.loop", at(2), { list: cel("[item.from, item.subject]") }),
          node("part", "logic.set", at(3), { fields: lit([assign("text", "item")]) }),
          node("collect", "flow.endLoop", at(4)),
          node("count", "logic.set", at(5), {
            fields: lit([assign("parts", "item.count"), assign("sender", "steps.inbox.from")]),
          }),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "each"),
          edge("e3", "each", "part"),
          edge("e4", "part", "collect"),
          edge("e5", "collect", "count"),
        ],
      ),
    },
    {
      name: AI_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          inbox(mailboxId, 1, 1),
          node("summary", "ai.summarize", at(2), { source: cel("item"), length: lit("short") }),
          node("facts", "ai.extract", at(3), {
            source: cel("steps.inbox"),
            fields: lit([
              { name: "sender", type: "text", description: "Who sent the message" },
              { name: "topic", type: "text", description: "What it is about, in a few words" },
            ]),
          }),
          node("sort", "ai.classify", at(4), {
            source: cel("steps.inbox"),
            categories: lit([
              { id: "work", name: "Work", description: "About a project, a meeting or a task" },
              { id: "money", name: "Money", description: "Orders, invoices and payments" },
            ]),
          }),
          node("reply", "ai.generate", at(5, 0), {
            prompt: {
              kind: "template",
              text: "Write a one-line reply to this message: {{steps.inbox.subject}}",
            },
            format: lit("text"),
          }),
          node("other", "ai.generate", at(5, 1), {
            prompt: {
              kind: "template",
              text: "Say in one line why this message fits no category: {{steps.inbox.subject}}",
            },
            format: lit("text"),
          }),
        ],
        [
          edge("e1", "manual", "inbox"),
          edge("e2", "inbox", "summary"),
          edge("e3", "summary", "facts"),
          edge("e4", "facts", "sort"),
          edge("e5", "sort", "reply", "cat:work"),
          edge("e6", "sort", "other", "other"),
        ],
      ),
    },
    {
      name: AGENT_WORKFLOW,
      enabled: true,
      graph: graph(
        [
          manual(),
          node("agent", "ai.agent", at(1), {
            agent: lit("mailbox"),
            task: lit("Find the newest message in the inbox and say in one sentence who sent it."),
            mailbox: lit(mailboxId),
            maxSteps: lit(4),
          }),
        ],
        [edge("e1", "manual", "agent")],
      ),
    },
    {
      name: BEFORE_SEND_WORKFLOW,
      enabled: false,
      graph: graph(
        [
          node("sending", "trigger.mail.beforeSend", at(0)),
          node("bcc", "mail.addBcc", at(1), { address: lit(BEFORE_SEND_BCC) }),
        ],
        [edge("e1", "sending", "bcc")],
      ),
    },
  ];
}
