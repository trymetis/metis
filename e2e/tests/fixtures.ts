import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { type APIRequestContext, test as base, expect, type TestInfo } from "@playwright/test";

import { type Rpc, RpcError, rpcBodySchema, rpcErrorSchema } from "../clients/rpc";
import { type Account, harness } from "./harness";

export { type Rpc, RpcError } from "../clients/rpc";

const MAIL_WINDOW_MS = 60_000;
const MAIL_BUDGET = 200;
const MAIL_MARGIN_MS = 1_000;
const MAIL_AI_PATHS = new Set([
  "/rpc/ai/analyzePhishing",
  "/rpc/ai/smartReplies",
  "/rpc/ai/draftApology",
  "/rpc/ai/draftStance",
  "/rpc/ai/threadSummary",
]);
const MAIL_PACING = new URL("../test-results/.mail-pacing.jsonl", import.meta.url);

function mailScoped(pathname: string): boolean {
  return pathname.startsWith("/rpc/mail/") || MAIL_AI_PATHS.has(pathname);
}

async function recentMailRequests(): Promise<number[]> {
  const text = await readFile(MAIL_PACING, "utf8").catch(() => "");
  const since = Date.now() - MAIL_WINDOW_MS;
  return text
    .split("\n")
    .filter(Boolean)
    .map(Number)
    .filter((at) => at > since)
    .toSorted((a, b) => a - b);
}

async function paceMail(): Promise<void> {
  const recent = await recentMailRequests();
  const pivot = recent[recent.length - MAIL_BUDGET];
  if (pivot === undefined) return;
  const wait = pivot + MAIL_WINDOW_MS + MAIL_MARGIN_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export interface RecordedRequest {
  at: number;
  path: string;
  status: number;
  source: "page" | "rpc";
}

export function rpcFor(request: APIRequestContext, record?: (entry: RecordedRequest) => void): Rpc {
  return async <T>(procedure: string, input: unknown = {}) => {
    const url = `/rpc/${procedure.replaceAll(".", "/")}`;
    const res = await request.post(url, {
      data: { json: input },
    });
    record?.({ at: Date.now(), path: url, status: res.status(), source: "rpc" });
    const body = rpcBodySchema.parse(await res.json());
    if (!res.ok()) {
      const error = rpcErrorSchema.safeParse(body.json).data;
      throw new RpcError(res.status(), error?.code ?? "", error?.message ?? "", error?.data);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- black-box client: the calling test names the response shape it expects and asserts on the values
    return body.json as T;
  };
}

export function uniqueName(testInfo: TestInfo): string {
  const hash = createHash("sha256").update(`${testInfo.testId}:${testInfo.retry}`).digest("hex");
  return `e2e-${hash.slice(0, 10)}`;
}

interface Fixtures {
  account: Account;
  rpc: Rpc;
  llmGuard: undefined;
  requestLog: RecordedRequest[];
}

export const test = base.extend<Fixtures>({
  // oxlint-disable-next-line no-empty-pattern --Playwright reads a fixture's dependencies from this destructuring pattern
  account: async ({}, use) => {
    await use(await harness.account());
  },

  requestLog: [
    async ({ page }, use, testInfo) => {
      await paceMail();
      const entries: RecordedRequest[] = [];
      page.on("response", (res) => {
        const { pathname } = new URL(res.url());
        if (pathname.startsWith("/rpc/")) {
          entries.push({ at: Date.now(), path: pathname, status: res.status(), source: "page" });
        }
      });
      await use(entries);
      if (entries.length === 0) return;
      const mailTimes = entries.filter((entry) => mailScoped(entry.path)).map((entry) => entry.at);
      if (mailTimes.length > 0) {
        await mkdir(new URL(".", MAIL_PACING), { recursive: true });
        await appendFile(MAIL_PACING, `${mailTimes.join("\n")}\n`);
      }
      const title = testInfo.titlePath.slice(1).join(" › ");
      const lines = entries.map((entry) =>
        JSON.stringify({ ...entry, project: testInfo.project.name, test: title }),
      );
      await mkdir(testInfo.project.outputDir, { recursive: true });
      await appendFile(
        path.join(testInfo.project.outputDir, "requests.jsonl"),
        `${lines.join("\n")}\n`,
      );
    },
    { auto: true, timeout: 90_000 },
  ],

  rpc: async ({ page, requestLog }, use) => {
    await use(rpcFor(page.request, (entry) => requestLog.push(entry)));
  },

  llmGuard: [
    // oxlint-disable-next-line no-empty-pattern --Playwright reads a fixture's dependencies from this destructuring pattern
    async ({}, use, testInfo) => {
      const before = (await harness.misses()).length;
      await use(undefined);
      const added = (await harness.misses()).slice(before);
      const keys = [...new Set(added.map((m) => `${m.path} ${m.key}`))];
      if (testInfo.project.metadata.parallel === true) {
        if (keys.length > 0) {
          testInfo.annotations.push({
            type: "llm-miss",
            description: `${keys.join(", ")} (during this test or one running beside it; global teardown fails the run)`,
          });
        }
        return;
      }
      expect(keys, "this test caused LLM replay misses; see GET /llm-misses").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
