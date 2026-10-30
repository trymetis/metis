import { z } from "zod";

import { APP } from "./harness";

export const rpcBodySchema = z.object({ json: z.unknown() });

export const rpcErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

export class RpcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

export type Rpc = <T = unknown>(procedure: string, input?: unknown) => Promise<T>;

const MAIL_BUDGET = 250;
const MAIL_WINDOW_MS = 60_000;
const mailSent: number[] = [];

async function paceMail(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (mailSent.length > 0 && now - (mailSent[0] ?? now) >= MAIL_WINDOW_MS) mailSent.shift();
    if (mailSent.length < MAIL_BUDGET) break;
    const oldest = mailSent[0] ?? now;
    await new Promise((resolve) => setTimeout(resolve, MAIL_WINDOW_MS - (now - oldest) + 50));
  }
  mailSent.push(Date.now());
}

export function rpcWithCookie(cookie: string): Rpc {
  return async <T>(procedure: string, input: unknown = {}) => {
    if (procedure.startsWith("mail.")) await paceMail();
    const res = await fetch(`${APP}/rpc/${procedure.replaceAll(".", "/")}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP, cookie },
      body: JSON.stringify({ json: input }),
    });
    const body = rpcBodySchema.parse(await res.json());
    if (!res.ok) {
      const error = rpcErrorSchema.safeParse(body.json).data;
      throw new RpcError(res.status, error?.code ?? "", error?.message ?? "", error?.data);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- black-box client: the calling test names the response shape it expects and asserts on the values
    return body.json as T;
  };
}
