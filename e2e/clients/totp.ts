import { z } from "zod";

import { harness } from "./harness";
import { RpcError } from "./rpc";

const MAX_WAIT_SEC = 300;
const TOTP_LIMITED = "Too many attempts. Please slow down.";

export async function withTotp<T>(run: (code: string) => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await run(await harness.totp());
    } catch (err) {
      if (!(err instanceof RpcError) || err.status !== 429 || err.message !== TOTP_LIMITED) {
        throw err;
      }
      const wait = z.object({ retryAfterSec: z.number() }).safeParse(err.data).data?.retryAfterSec;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(wait ?? 60, MAX_WAIT_SEC) * 1000 + 1000),
      );
    }
  }
}
