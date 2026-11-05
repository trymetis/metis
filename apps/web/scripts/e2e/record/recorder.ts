import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { setTimeout as sleep } from "node:timers/promises";

import { type LlmResponse, type LlmSeeds, llmKey } from "@metis/e2e/lib/llm-key";
import { z } from "zod";

import type { Journal } from "./journal";

type Seed = LlmSeeds[string];

const QUIET_MS = 3_000;
const SETTLE_MAX_MS = 20 * 60_000;
const HEADERS_TIMEOUT_MS = 5 * 60_000;
const IDLE_TIMEOUT_MS = 2 * 60_000;
const TOTAL_TIMEOUT_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;
const MAX_RETRY_AFTER_MS = 120_000;
const STOPPING_STATUSES = new Set([401, 402, 403]);
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);

export interface UpstreamTarget {
  name: string;
  url: string;
  key: string;
  concurrency: number;
}

export interface ScenarioUsage {
  keys: Set<string>;
  reused: number;
  recorded: number;
  misses: number;
  failures: string[];
  costNanoUsd: number;
  uncosted: number;
  pending: number;
  lastActivity: number;
}

export interface RecorderOptions {
  runId: string;
  plan: boolean;
  forced: (scenarioId: string) => boolean;
  maxNew: number | null;
  llm: UpstreamTarget | null;
  decision: UpstreamTarget | null;
  journal: Journal;
  previous: LlmSeeds;
}

export interface Recorder {
  urlFor(scenarioId: string): string;
  usage(scenarioId: string): ScenarioUsage;
  settle(scenarioId: string): Promise<void>;
  find(key: string): Seed | undefined;
  close(): Promise<void>;
}

type Outcome = { ok: true; seed: Seed } | { ok: false; message: string; response?: LlmResponse };

interface Fetched extends LlmResponse {
  retryAfterMs: number | null;
}

function semaphore(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(run: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await run();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

function hasError(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      parsed.error !== undefined &&
      parsed.error !== null
    );
  } catch {
    return false;
  }
}

const DECISION_PATH = "/systemone";
const NANO_USD_PER_USD = 1_000_000_000;
export const DECISION_INPUT_NANO_USD_PER_TOKEN = 42;
export const DECISION_OUTPUT_NANO_USD_PER_TOKEN = 0;

const usageSchema = z.object({
  usage: z
    .object({
      cost: z.number().optional(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .nullish(),
});

type ResponseUsage = NonNullable<z.infer<typeof usageSchema>["usage"]>;

export function formatUsd(nanoUsd: number): string {
  return `$${(nanoUsd / NANO_USD_PER_USD).toFixed(9)}`;
}

function usageCost(path: string, usage: ResponseUsage): number | null {
  if (path !== DECISION_PATH) {
    return usage.cost === undefined ? null : Math.round(usage.cost * NANO_USD_PER_USD);
  }
  if (usage.input_tokens === undefined && usage.output_tokens === undefined) return null;
  return (
    (usage.input_tokens ?? 0) * DECISION_INPUT_NANO_USD_PER_TOKEN +
    (usage.output_tokens ?? 0) * DECISION_OUTPUT_NANO_USD_PER_TOKEN
  );
}

function payloads(response: LlmResponse): string[] {
  if (!response.contentType.includes("text/event-stream")) return [response.body];
  return response.body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((data) => data !== "" && data !== "[DONE]");
}

function responseCost(path: string, response: LlmResponse): number | null {
  let total: number | null = null;
  for (const payload of payloads(response)) {
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    const usage = usageSchema.safeParse(json).data?.usage;
    const cost = usage ? usageCost(path, usage) : null;
    if (cost !== null) total = (total ?? 0) + cost;
  }
  return total;
}

function bodyFailure(response: LlmResponse): string | null {
  if (response.status >= 400) return `HTTP ${response.status}`;
  if (response.contentType.includes("text/event-stream")) {
    const failed = response.body
      .split("\n")
      .some((line) => line.startsWith("data:") && hasError(line.slice("data:".length).trim()));
    return failed ? "stream error" : null;
  }
  const body = response.body.trim();
  if (!body) return "empty body";
  return hasError(body) ? "error body" : null;
}

function retryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : null;
}

function backoff(attempt: number): number {
  const base = Math.min(2000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return base / 2 + Math.random() * (base / 2);
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
    return `${err.message}${cause}`;
  }
  return String(err);
}

async function fetchOnce(
  target: UpstreamTarget,
  path: string,
  request: Record<string, unknown>,
): Promise<Fetched> {
  const controller = new AbortController();
  let idle: NodeJS.Timeout | undefined;
  const armIdle = (ms: number, reason: string) => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new Error(reason)), ms);
  };
  const total = setTimeout(
    () => controller.abort(new Error(`gave up after ${TOTAL_TIMEOUT_MS / 60_000} min`)),
    TOTAL_TIMEOUT_MS,
  );
  armIdle(HEADERS_TIMEOUT_MS, `no response headers for ${HEADERS_TIMEOUT_MS / 60_000} min`);
  try {
    const res = await fetch(`${target.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${target.key}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const idleReason = `no data for ${IDLE_TIMEOUT_MS / 1000}s`;
    armIdle(IDLE_TIMEOUT_MS, idleReason);
    let body = "";
    if (res.body) {
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        armIdle(IDLE_TIMEOUT_MS, idleReason);
      }
      body += decoder.decode();
    }
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/json",
      body,
      retryAfterMs: retryAfter(res.headers.get("retry-after")),
    };
  } finally {
    clearTimeout(idle);
    clearTimeout(total);
  }
}

function errorResponse(status: number, message: string): LlmResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ error: { message, type: "record_failed" } }),
  };
}

export async function startRecorder(options: RecorderOptions): Promise<Recorder> {
  const thisRun = new Map<string, Seed>();
  const journaled = new Map<string, Seed>();
  for (const entry of options.journal.read()) {
    journaled.set(entry.key, {
      path: entry.path,
      request: entry.request,
      response: entry.response,
    });
  }
  const usages = new Map<string, ScenarioUsage>();
  const inFlight = new Map<string, Promise<Outcome>>();
  const limits = new Map<UpstreamTarget, ReturnType<typeof semaphore>>();
  const stopped = new Map<UpstreamTarget, string>();
  let started = 0;

  function usage(scenarioId: string): ScenarioUsage {
    let found = usages.get(scenarioId);
    if (!found) {
      found = {
        keys: new Set(),
        reused: 0,
        recorded: 0,
        misses: 0,
        failures: [],
        costNanoUsd: 0,
        uncosted: 0,
        pending: 0,
        lastActivity: Date.now(),
      };
      usages.set(scenarioId, found);
    }
    return found;
  }

  function lookup(key: string, scenarioId: string): Seed | undefined {
    const current = thisRun.get(key);
    if (current) return current;
    if (options.forced(scenarioId)) return undefined;
    const found = journaled.get(key) ?? options.previous[key];
    if (found) thisRun.set(key, found);
    return found;
  }

  function targetFor(path: string): UpstreamTarget | null {
    return path === DECISION_PATH ? options.decision : options.llm;
  }

  async function callUpstream(
    target: UpstreamTarget,
    path: string,
    request: Record<string, unknown>,
    scenarioId: string,
  ): Promise<Outcome> {
    const label = `${path} ${String(request.model)}`;
    let last: Outcome = { ok: false, message: `${label}: no attempt made` };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const reason = stopped.get(target);
      if (reason) return { ok: false, message: reason };
      let fetched: Fetched | undefined;
      let failure: string | null;
      try {
        fetched = await fetchOnce(target, path, request);
        failure = bodyFailure(fetched);
      } catch (err) {
        failure = `network: ${describe(err)}`;
      }
      const cost = fetched ? responseCost(path, fetched) : null;
      if (cost !== null) usage(scenarioId).costNanoUsd += cost;
      if (!failure && fetched) {
        if (cost === null) usage(scenarioId).uncosted++;
        const { retryAfterMs: _, ...response } = fetched;
        return { ok: true, seed: { path, request, response } };
      }
      const detail = fetched?.body.trim().slice(0, 300) ?? "";
      const message = `${label}: ${failure} (attempt ${attempt}/${MAX_ATTEMPTS}) ${detail}`;
      console.error(`[record] upstream ${message}`);
      last = { ok: false, message, response: fetched };
      if (fetched && STOPPING_STATUSES.has(fetched.status)) {
        const stop = `${target.name} answered HTTP ${fetched.status}; no more calls go to it this run`;
        stopped.set(target, stop);
        console.error(`[record] ${stop}`);
        return { ok: false, message: stop, response: fetched };
      }
      const status = fetched?.status ?? 0;
      if (status >= 400 && status < 500 && !RETRYABLE_STATUSES.has(status)) {
        return last;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(fetched?.retryAfterMs ?? backoff(attempt));
      }
    }
    return last;
  }

  async function record(
    key: string,
    path: string,
    request: Record<string, unknown>,
    scenarioId: string,
  ): Promise<Outcome> {
    const target = targetFor(path);
    if (!target) {
      return { ok: false, message: `no upstream configured for ${path}` };
    }
    const reason = stopped.get(target);
    if (reason) return { ok: false, message: reason };
    if (options.maxNew !== null && started >= options.maxNew) {
      return {
        ok: false,
        message: `--max-new ${options.maxNew} reached; ${path} not sent`,
      };
    }
    started++;
    let limit = limits.get(target);
    if (!limit) {
      limit = semaphore(target.concurrency);
      limits.set(target, limit);
    }
    const outcome = await limit(() => callUpstream(target, path, request, scenarioId));
    if (outcome.ok) {
      options.journal.append({
        runId: options.runId,
        scenario: scenarioId,
        key,
        path,
        request,
        response: outcome.seed.response,
        at: new Date().toISOString(),
      });
      thisRun.set(key, outcome.seed);
      const cost = responseCost(path, outcome.seed.response);
      console.log(
        `[record] ${scenarioId} recorded ${key} ${path} ${String(request.model)} ${cost === null ? "no cost or usage in the response" : formatUsd(cost)}`,
      );
    }
    return outcome;
  }

  async function capture(
    scenarioId: string,
    path: string,
    request: Record<string, unknown>,
  ): Promise<LlmResponse> {
    const used = usage(scenarioId);
    used.pending++;
    used.lastActivity = Date.now();
    try {
      const key = llmKey(path, request);
      used.keys.add(key);
      const hit = lookup(key, scenarioId);
      if (hit) {
        used.reused++;
        return hit.response;
      }
      if (options.plan) {
        used.misses++;
        return errorResponse(501, `plan: no recording for ${key}`);
      }
      const running = inFlight.get(key);
      const job = running ?? record(key, path, request, scenarioId);
      if (!running) {
        inFlight.set(key, job);
        void job.finally(() => inFlight.delete(key));
      }
      const outcome = await job;
      if (outcome.ok) {
        if (running) used.reused++;
        else used.recorded++;
        return outcome.seed.response;
      }
      used.failures.push(outcome.message);
      return outcome.response ?? errorResponse(502, outcome.message);
    } finally {
      used.pending--;
      used.lastActivity = Date.now();
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const match = /^\/s\/([^/]+)\/v1(\/.*)$/.exec(url.pathname);
    try {
      if (!match?.[1] || !match[2]) {
        res.writeHead(404).end();
        return;
      }
      const scenarioId = decodeURIComponent(match[1]);
      const path = match[2];
      if (req.method === "GET" && path === "/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [] }));
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      const request = z.record(z.string(), z.unknown()).parse(JSON.parse(await text(req)));
      const response = await capture(scenarioId, path, request);
      res.writeHead(response.status, { "content-type": response.contentType });
      res.end(response.body);
    } catch (err) {
      console.error(`[record] proxy ${url.pathname}: ${describe(err)}`);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("[record] the proxy did not bind a TCP port");
  }
  const { port } = address;

  return {
    urlFor: (scenarioId) => `http://127.0.0.1:${port}/s/${encodeURIComponent(scenarioId)}/v1`,
    usage,
    async settle(scenarioId) {
      const used = usage(scenarioId);
      const deadline = Date.now() + SETTLE_MAX_MS;
      while (
        Date.now() < deadline &&
        (used.pending > 0 || Date.now() - used.lastActivity < QUIET_MS)
      ) {
        await sleep(250);
      }
    },
    find: (key) => thisRun.get(key) ?? journaled.get(key) ?? options.previous[key],
    async close() {
      await Promise.allSettled(inFlight.values());
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
