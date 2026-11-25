import "server-only";
import type { MailAdapter } from "./adapter";
import { decodeBody } from "./charset";

export function rawText(raw: Buffer): string {
  return decodeBody(raw, undefined);
}

export async function readRawText(adapter: MailAdapter, id: string): Promise<string> {
  return rawText(await adapter.getRaw(id));
}
