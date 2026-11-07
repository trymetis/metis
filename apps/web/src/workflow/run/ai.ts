import "server-only";
import { modelMessageSchema } from "ai";
import { z } from "zod";

import { WORKFLOW_AGENTS, workflowWriterAgent } from "@/mastra/agents/workflow-agents";
import { principalRequestContext } from "@/mastra/runtime-context";
import {
  DecisionConfigError,
  decideOne,
  decisionEnabled,
  decisionUsageProvider,
  getDecision,
} from "@/services/decision";
import { getLlm, structuredOutput } from "@/services/llm";

import {
  answerLabel,
  branchQuestion,
  decisionState,
  nodeQuestions,
  routeAnswer,
  toDecisionAnswer,
  wireQuestion,
} from "../decision";
import { type FieldDecl, parseCategories, parseFieldDecls } from "../fields";
import type { Item } from "../runtime";
import type { ResourceKind } from "../steps/types";
import {
  BlockedError,
  emit,
  numberOf,
  type Params,
  record,
  type Runner,
  type StepCtx,
  text,
} from "./types";

const SOURCE_LIMIT = 12_000;
const MAX_SOURCES = 50;

function resourcesIn(value: unknown, into: { kind: ResourceKind; id: string }[] = [], depth = 0) {
  if (depth > 3 || !value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 50)) resourcesIn(entry, into, depth + 1);
    return into;
  }
  const own = record(value);
  if (typeof own.mailboxId === "string" && own.mailboxId)
    into.push({ kind: "mailbox", id: own.mailboxId });
  if (typeof own.accountId === "string" && own.accountId && typeof own.calendarId === "string") {
    into.push({ kind: "calendar", id: own.accountId });
  }
  if (typeof own.driveId === "string" && own.driveId) into.push({ kind: "drive", id: own.driveId });
  if (typeof own.addressBookId === "string" && own.addressBookId) {
    into.push({ kind: "addressbook", id: own.addressBookId });
  }
  for (const nested of Object.values(own)) resourcesIn(nested, into, depth + 1);
  return into;
}

function nodeResources(params: Params): { kind: ResourceKind; id: string }[] {
  const own: { kind: ResourceKind; id: string }[] = [];
  for (const [name, kind] of [
    ["mailbox", "mailbox"],
    ["calendar", "calendar"],
    ["drive", "drive"],
    ["addressbook", "addressbook"],
  ] as const) {
    const id = text(params, name);
    if (id) own.push({ kind, id });
  }
  return own;
}

async function requireAiFor(ctx: StepCtx, params: Params, values: unknown[]) {
  const all = [...nodeResources(params), ...values.flatMap((value) => resourcesIn(value))];
  const unique = [...new Map(all.map((r) => [`${r.kind}:${r.id}`, r])).values()];
  await ctx.requireAi(unique);
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null)) as unknown;
}

function sourceText(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(jsonSafe(value), null, 1);
  return raw.length > SOURCE_LIMIT ? `${raw.slice(0, SOURCE_LIMIT)}…` : raw;
}

function fieldSchema(decl: FieldDecl): z.ZodType {
  const described = (schema: z.ZodType) =>
    decl.description ? schema.describe(decl.description) : schema;
  switch (decl.type) {
    case "number":
      return described(z.number().nullable());
    case "boolean":
      return described(z.boolean().nullable());
    case "date":
      return described(
        z
          .string()
          .nullable()
          .describe(`${decl.description ?? decl.name}, as an ISO-8601 date-time`),
      );
    case "text list":
      return described(z.array(z.string()));
    default:
      return described(z.string().nullable());
  }
}

function fieldsObject(decls: FieldDecl[]) {
  return z.object(Object.fromEntries(decls.map((decl) => [decl.name, fieldSchema(decl)])));
}

function cleanData(decls: FieldDecl[], data: unknown): Record<string, unknown> {
  const source = record(data);
  return Object.fromEntries(
    decls.map((decl) => {
      const value = source[decl.name];
      if (value === null || value === undefined) {
        return [
          decl.name,
          decl.type === "text list"
            ? []
            : decl.type === "boolean"
              ? false
              : decl.type === "number"
                ? 0
                : "",
        ];
      }
      return [decl.name, value];
    }),
  );
}

function usage(ctx: StepCtx, feature: "workflow-ai", result: { totalUsage?: unknown }) {
  ctx.usage({ feature, provider: "", model: getLlm().chat.modelId, usage: result.totalUsage });
}

async function structured(
  ctx: StepCtx,
  prompt: string,
  decls: FieldDecl[],
): Promise<{ data: Record<string, unknown>; complete: boolean }> {
  const schema = fieldsObject(decls);
  const result = await workflowWriterAgent.generate(prompt, {
    structuredOutput: {
      ...structuredOutput(schema),
      errorStrategy: "fallback",
      fallbackValue: null,
    },
    abortSignal: ctx.signal,
  });
  usage(ctx, "workflow-ai", result);
  if (result.usedFallbackValue || !result.object)
    return { data: cleanData(decls, {}), complete: false };
  return { data: cleanData(decls, result.object), complete: true };
}

const ask: Runner = {
  async run(ctx, params) {
    if (!decisionEnabled("workflowNode")) {
      throw new BlockedError("Ask and Branch steps are turned off on this instance");
    }
    await requireAiFor(ctx, params, [params.subject]);
    const include = Array.isArray(params.include) ? params.include.map(String) : [];
    const questions = nodeQuestions(ctx.node);
    let outcome: Awaited<ReturnType<typeof decideOne>>;
    try {
      outcome = await decideOne({
        state: decisionState(params.subject, include),
        questions: Object.fromEntries(
          questions.map((question) => [question.id, wireQuestion(question)]),
        ),
        signal: ctx.signal,
      });
    } catch (err) {
      if (err instanceof DecisionConfigError) throw new BlockedError(err.message);
      throw err;
    }
    const model = outcome.refused ? getDecision().model.modelId : outcome.modelId;
    if (!outcome.refused) {
      ctx.usage({
        feature: "workflow-decision",
        provider: decisionUsageProvider(),
        model,
        usage: outcome.usage,
      });
    }
    const answers = outcome.refused ? null : record(outcome.answers);
    return {
      kind: "emit",
      emits: questions.map((question) => ({
        handle: `q:${question.id}`,
        result: {
          answered: !outcome.refused,
          question,
          answer: answers ? toDecisionAnswer(answers[question.id]) : { type: "refusal" },
          model,
        },
      })),
      detail: outcome.refused ? "refused" : "answered",
    };
  },
};

const branch: Runner = {
  run(ctx, params, item) {
    const found = branchQuestion(ctx.graph, ctx.node.id);
    if (!found) throw new Error("This Branch step is not connected to a question");
    const asked = record(item.trail[found.ask.id]);
    const answer = toDecisionAnswer(asked.answer ?? { type: "refusal" });
    const routed = routeAnswer(found.question, answer, {
      yesAt: numberOf(params, "yesAt", 0.8),
      noAt: numberOf(params, "noAt", 0.2),
      minProbability: numberOf(params, "minProbability", 0.6),
    });
    const model = typeof asked.model === "string" ? asked.model : "";
    return Promise.resolve({
      kind: "emit",
      emits: [
        {
          handle: routed.handle,
          result: {
            value: routed.handle,
            label: answerLabel(found.question, routed.handle),
            probability: routed.probability,
            score: routed.score ?? 0,
            model,
          },
        },
      ],
      detail: routed.handle,
      receipt: {
        operation: "decide",
        decision: {
          handle: routed.handle,
          probability: routed.probability,
          model,
          ...(routed.score !== undefined ? { score: routed.score } : {}),
        },
      },
    });
  },
};

const generate: Runner = {
  async run(ctx, params, item) {
    await requireAiFor(ctx, params, [item.value]);
    const prompt = text(params, "prompt");
    if (text(params, "format") === "fields") {
      const decls = parseFieldDecls(
        ctx.node.params.fields?.kind === "literal" ? ctx.node.params.fields.value : [],
      );
      const { data, complete } = await structured(ctx, prompt, decls);
      return emit(
        { text: "", data, complete },
        complete ? "filled in" : "could not fill in every field",
      );
    }
    const result = await workflowWriterAgent.generate(prompt, { abortSignal: ctx.signal });
    usage(ctx, "workflow-ai", result);
    return emit({ text: result.text.trim(), data: {}, complete: true }, "written");
  },
};

const extract: Runner = {
  async run(ctx, params) {
    await requireAiFor(ctx, params, [params.source]);
    const decls = parseFieldDecls(
      ctx.node.params.fields?.kind === "literal" ? ctx.node.params.fields.value : [],
    );
    const instructions = text(params, "instructions");
    const prompt = `${instructions ? `${instructions}\n\n` : ""}Fill in the fields from this source. Leave a field null when the source does not say.\n\n<source>\n${sourceText(params.source)}\n</source>`;
    const { data, complete } = await structured(ctx, prompt, decls);
    return emit({ data, complete }, complete ? "extracted" : "could not extract every field");
  },
};

const LENGTHS: Record<string, string> = {
  short: "one sentence",
  medium: "one short paragraph",
  long: "a few short paragraphs",
};

const summarize: Runner = {
  async run(ctx, params) {
    await requireAiFor(ctx, params, [params.source]);
    const length = LENGTHS[text(params, "length")] ?? "one sentence";
    const result = await workflowWriterAgent.generate(
      `Summarize this in ${length}. Be concrete; keep names, dates and amounts.\n\n<source>\n${sourceText(params.source)}\n</source>`,
      { abortSignal: ctx.signal },
    );
    usage(ctx, "workflow-ai", result);
    return emit({ summary: result.text.trim() }, "summarized");
  },
};

const classify: Runner = {
  async run(ctx, params) {
    await requireAiFor(ctx, params, [params.source]);
    const categories = parseCategories(
      ctx.node.params.categories?.kind === "literal" ? ctx.node.params.categories.value : [],
    );
    const ids = categories.map((c) => c.id);
    const schema = z.object({
      category: z.string().describe(`One of: ${[...ids, "other"].join(", ")}`),
      confidence: z.number().min(0).max(1),
    });
    const instructions = text(params, "instructions");
    const list = categories
      .map((c) => `- ${c.id}: ${c.name}${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");
    const result = await workflowWriterAgent.generate(
      `${instructions ? `${instructions}\n\n` : ""}Put the source in exactly one category, or "other" when none fits.\n\nCategories:\n${list}\n\n<source>\n${sourceText(params.source)}\n</source>`,
      {
        structuredOutput: {
          ...structuredOutput(schema),
          errorStrategy: "fallback",
          fallbackValue: { category: "other", confidence: 0 },
        },
        abortSignal: ctx.signal,
      },
    );
    usage(ctx, "workflow-ai", result);
    const picked = record(result.object);
    const id =
      typeof picked.category === "string" && ids.includes(picked.category)
        ? picked.category
        : "other";
    const label = categories.find((c) => c.id === id)?.name ?? "Other";
    const confidence = typeof picked.confidence === "number" ? picked.confidence : 0;
    return {
      kind: "emit",
      emits: [
        {
          handle: id === "other" ? "other" : `cat:${id}`,
          result: { category: id, label, confidence },
        },
      ],
      detail: label,
    };
  },
};

interface AgentState {
  messages: unknown[];
  rounds: number;
  sources: string[];
  startedAt: string;
}

function agentState(ctx: StepCtx): AgentState | null {
  const state = ctx.state;
  if (!state || !Array.isArray(state.messages)) return null;
  return {
    messages: state.messages,
    rounds: typeof state.rounds === "number" ? state.rounds : 0,
    sources: Array.isArray(state.sources) ? state.sources.map(String) : [],
    startedAt: typeof state.startedAt === "string" ? state.startedAt : ctx.now.toISOString(),
  };
}

const SOURCE_KEYS = ["id", "eventId", "fileId", "threadId"];

function collectSources(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 4 || into.size >= MAX_SOURCES || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectSources(entry, into, depth + 1);
    return;
  }
  const own = record(value);
  for (const key of SOURCE_KEYS) {
    const found = own[key];
    if (typeof found === "string" && found) into.add(found);
  }
  for (const nested of Object.values(own)) collectSources(nested, into, depth + 1);
}

const AGENT_KINDS = ["mailbox", "calendar", "drive", "workspace"] as const;
type AgentKind = (typeof AGENT_KINDS)[number];

async function agentContext(
  ctx: StepCtx,
  params: Params,
  item: Item,
): Promise<{ kind: AgentKind; rc: Awaited<ReturnType<typeof principalRequestContext>> }> {
  const kind = AGENT_KINDS.find((candidate) => candidate === (text(params, "agent") || "mailbox"));
  if (!kind) throw new Error("Pick an agent");
  const from = record(item.value);
  const principal = ctx.principal;
  if (!principal.userId || !principal.workspaceId || !principal.role) {
    throw new BlockedError("This workflow has no execution principal");
  }
  const scope = {
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    workspaceRole: principal.role,
    runId: ctx.runId,
  };
  if (kind === "mailbox") {
    const mailboxId =
      text(params, "mailbox") || (typeof from.mailboxId === "string" ? from.mailboxId : "");
    if (!mailboxId) throw new Error("Pick the mailbox the agent works in");
    await ctx.requireAi([{ kind: "mailbox", id: mailboxId }]);
    await ctx.mailbox(mailboxId);
    return { kind, rc: await principalRequestContext(kind, scope, { mailboxId }) };
  }
  if (kind === "calendar") {
    const accountId =
      text(params, "calendar") || (typeof from.accountId === "string" ? from.accountId : "");
    if (!accountId) throw new Error("Pick the calendar the agent works in");
    await ctx.requireAi([{ kind: "calendar", id: accountId }]);
    return {
      kind,
      rc: await principalRequestContext(kind, scope, { calendar: await ctx.calendar(accountId) }),
    };
  }
  if (kind === "drive") {
    const driveId = text(params, "drive") || (typeof from.driveId === "string" ? from.driveId : "");
    if (!driveId) throw new Error("Pick the drive the agent works in");
    await ctx.requireAi([{ kind: "drive", id: driveId }]);
    return {
      kind,
      rc: await principalRequestContext(kind, scope, { drive: await ctx.drive(driveId) }),
    };
  }
  return { kind, rc: await principalRequestContext(kind, scope, {}) };
}

const ROUND_MARGIN_MS = 20_000;

const agent: Runner = {
  async run(ctx, params, item) {
    const { kind, rc } = await agentContext(ctx, params, item);
    if (!rc) throw new BlockedError("AI is turned off for what this agent would read");
    const runner = WORKFLOW_AGENTS[kind];
    const prior = agentState(ctx);
    const maxRounds = numberOf(params, "maxSteps", 8);
    const minutes = numberOf(params, "minutes", 5);
    const startedAt = prior ? new Date(prior.startedAt) : ctx.now;
    const state: AgentState = prior ?? {
      messages: [
        {
          role: "user",
          content: `Run time: ${ctx.now.toISOString()} (time zone ${ctx.timezone}).\n\nTask:\n${text(params, "task")}\n\n<item>\n${sourceText(item.value)}\n</item>`,
        },
      ],
      rounds: 0,
      sources: [],
      startedAt: startedAt.toISOString(),
    };
    const sources = new Set(state.sources);
    const tickEnds = ctx.deadline ?? Date.now() + 25_000;
    let finalText: string | null = null;

    while (state.rounds < maxRounds) {
      if (Date.now() - startedAt.getTime() > minutes * 60_000) break;
      if (Date.now() > tickEnds - ROUND_MARGIN_MS && state.rounds > (prior?.rounds ?? 0)) {
        return {
          kind: "wait",
          waitKind: "time",
          until: new Date(),
          deadline: null,
          state: { ...state, sources: [...sources] },
          detail: `working (round ${state.rounds})`,
        };
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- each model round needs the previous round's messages
      const result = await runner.generate(z.array(modelMessageSchema).parse(state.messages), {
        requestContext: rc,
        maxSteps: 1,
        abortSignal: ctx.signal,
      });
      ctx.usage({
        feature: "workflow-agent",
        provider: "",
        model: getLlm().chat.modelId,
        usage: result.totalUsage,
      });
      state.rounds += 1;
      state.messages = [...state.messages, ...(result.response.messages ?? [])];
      collectSources(result.toolResults, sources);
      if (result.finishReason !== "tool-calls") {
        finalText = result.text.trim();
        break;
      }
    }

    const complete = finalText !== null;
    const textOut = finalText ?? "The agent ran out of tool calls or time before it finished.";
    const decls =
      text(params, "format") === "fields"
        ? parseFieldDecls(
            ctx.node.params.fields?.kind === "literal" ? ctx.node.params.fields.value : [],
          )
        : [];
    const typed =
      decls.length > 0
        ? await structured(
            ctx,
            `Fill in the fields from this answer.\n\n<answer>\n${textOut}\n</answer>`,
            decls,
          )
        : { data: {}, complete: true };
    return emit(
      {
        text: textOut,
        data: typed.data,
        sources: [...sources].slice(0, MAX_SOURCES),
        complete: complete && typed.complete,
      },
      complete ? `done in ${state.rounds} round(s)` : "stopped before finishing",
    );
  },
};

export const AI_RUNNERS = {
  "ai.ask": ask,
  "ai.branch": branch,
  "ai.generate": generate,
  "ai.extract": extract,
  "ai.summarize": summarize,
  "ai.classify": classify,
  "ai.agent": agent,
} as const satisfies Record<string, Runner>;
