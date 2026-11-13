import { once } from "node:events";
import type { Writable } from "node:stream";

import { z } from "zod";

import { handle } from "./app";
import { ingestReceipt, receiptEventSchema } from "./ingest";

interface ResponsePrelude {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
}

declare const awslambda: {
  streamifyResponse(
    handler: (event: unknown, responseStream: Writable) => Promise<void>,
  ): (event: unknown, responseStream: Writable) => Promise<void>;
  HttpResponseStream: {
    from(responseStream: Writable, prelude: ResponsePrelude): Writable;
  };
};

const urlEventSchema = z.object({
  rawPath: z.string(),
  rawQueryString: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  cookies: z.array(z.string()).optional(),
  body: z.string().optional(),
  isBase64Encoded: z.boolean().optional(),
  requestContext: z.object({
    domainName: z.string(),
    http: z.object({ method: z.string() }),
  }),
});

type UrlEvent = z.infer<typeof urlEventSchema>;

function toRequest(event: UrlEvent): Request {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `https://${event.requestContext.domainName}${event.rawPath}${query}`;
  const method = event.requestContext.http.method.toUpperCase();
  const headers = new Headers(event.headers ?? {});
  if (event.cookies && event.cookies.length > 0) headers.set("cookie", event.cookies.join("; "));
  const hasBody = method !== "GET" && method !== "HEAD" && event.body !== undefined;
  const body = hasBody
    ? event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64")
      : (event.body ?? "")
    : undefined;
  return new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
}

async function writeResponse(response: Response, responseStream: Writable): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers,
  });
  stream.write(new Uint8Array(0));
  if (response.body) {
    for await (const chunk of response.body) {
      if (!stream.write(chunk)) await once(stream, "drain");
    }
  }
  stream.end();
  await once(stream, "finish");
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const receipt = receiptEventSchema.safeParse(event);
  if (receipt.success) {
    const outcomes = await ingestReceipt(receipt.data);
    console.log(`[metis-ses] receipt ${outcomes.join(", ")}`);
    responseStream.end(JSON.stringify({ ok: true, outcomes }));
    return;
  }

  const urlEvent = urlEventSchema.safeParse(event);
  if (!urlEvent.success) {
    console.error("[metis-ses] unrecognized event");
    responseStream.end();
    return;
  }

  await writeResponse(await handle(toRequest(urlEvent.data)), responseStream);
});
