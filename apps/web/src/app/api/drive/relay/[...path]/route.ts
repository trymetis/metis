import { getDriveById, resolveConnectionAuth } from "@/connections";
import { type DriveAdapter, getDriveAdapter } from "@/drive/adapter";
import {
  acquireRelaySlot,
  contentDisposition,
  RELAY_BUSY,
  RelayLimitError,
  relayMaxBytes,
  relayStream,
  relayTooLarge,
} from "@/drive/relay";
import { type RelayGrant, verifyRelayRequest } from "@/drive/relay-signature";
import { failureStatus } from "@/lib/errors/provider-error";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { maintenanceResponse } from "@/maintenance/response";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";
import type { DriveStream } from "@/types/drive";

const INVALID_LINK = "This link is invalid or has expired";
const DRIVE_NOT_FOUND = "Drive not found";

function relayLimitIn(err: unknown): RelayLimitError | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof RelayLimitError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function closing(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("connection", "close");
  return new Response(res.body, { status: res.status, headers });
}

function refuse(status: number, error: string): Response {
  return closing(Response.json({ error }, { status }));
}

async function relayAdapter(grant: RelayGrant): Promise<DriveAdapter | null> {
  const found = await getDriveById(grant.driveId);
  if (!found) return null;
  const auth = await resolveConnectionAuth(found);
  if (!auth) return null;
  return getDriveAdapter(found.provider, auth, found.email);
}

export async function GET(request: Request) {
  const closed = maintenanceResponse(false, request.url);
  if (closed) return closed;

  const grant = await verifyRelayRequest("GET", new URL(request.url));
  if (!grant) return Response.json({ error: INVALID_LINK }, { status: 403 });

  const rl = await rateLimit(grant.userId, {
    scope: "drive-relay-download",
    limit: 120,
    windowSec: 60,
  });
  if (!rl.ok) return tooManyRequests(rl);

  const release = acquireRelaySlot(grant.userId);
  if (!release) return Response.json({ error: RELAY_BUSY }, { status: 429 });

  let opened: DriveStream;
  try {
    const adapter = await relayAdapter(grant);
    if (!adapter) {
      release();
      return Response.json({ error: DRIVE_NOT_FOUND }, { status: 404 });
    }
    opened = await adapter.readStream(grant.key, request.signal);
  } catch (err) {
    release();
    console.error("[drive-relay]", err);
    return Response.json({ error: sanitizeError(err) }, { status: failureStatus(err) });
  }

  if (opened.size !== null && opened.size > relayMaxBytes()) {
    await opened.body.cancel().catch(() => {});
    opened.release();
    release();
    return Response.json({ error: relayTooLarge().message }, { status: 413 });
  }

  const body = relayStream(opened.body, relayMaxBytes(), () => {
    opened.release();
    release();
  });

  const headers = new Headers({
    "Content-Type": opened.mimeType ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(opened.name),
    "Cache-Control": "private, no-store",
  });
  if (opened.size !== null) {
    headers.set("Content-Length", String(opened.size));
  }
  return new Response(body, { headers });
}

export async function PUT(request: Request) {
  const closed = maintenanceResponse(false, request.url);
  if (closed) return closing(closed);

  const grant = await verifyRelayRequest("PUT", new URL(request.url));
  if (!grant) return refuse(403, INVALID_LINK);

  const rl = await rateLimit(grant.userId, {
    scope: "drive-relay-upload",
    limit: 60,
    windowSec: 60,
  });
  if (!rl.ok) return closing(tooManyRequests(rl));

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > relayMaxBytes()) {
    return refuse(413, relayTooLarge().message);
  }

  const release = acquireRelaySlot(grant.userId);
  if (!release) return refuse(429, RELAY_BUSY);

  const source = request.body ?? new ReadableStream<Uint8Array>();
  const body = relayStream(source, relayMaxBytes(), release);

  try {
    const adapter = await relayAdapter(grant);
    if (!adapter) return refuse(404, DRIVE_NOT_FOUND);
    await adapter.writeStream(
      {
        parentId: grant.query.parent ?? null,
        name: grant.key,
        size: Number.isFinite(declared) ? declared : 0,
        mime: request.headers.get("content-type") ?? "application/octet-stream",
      },
      body,
      request.signal,
    );
    return new Response(null, { status: 200 });
  } catch (err) {
    const limit = relayLimitIn(err);
    if (limit) return refuse(413, limit.message);
    console.error("[drive-relay]", err);
    return refuse(502, sanitizeError(err));
  } finally {
    await body.cancel().catch(() => {});
    release();
  }
}
