"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  PREVIEW_CAPS,
  type PreviewKind,
  previewBlobType,
  previewKind,
  truncatesAtCap,
} from "@/drive/preview";
import {
  openPreviewCacheWriter,
  type PreviewCacheWriter,
  previewCacheKey,
  readCachedPreview,
} from "@/drive/preview-cache";
import type { DriveEntryRow } from "@/server/schema";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

const downloadTargetSchema = z.object({ url: z.string() });

const routeErrorSchema = z.object({
  error: z.string().optional(),
  webUrl: z.string().optional(),
});

export type DrivePreviewState =
  | { status: "unsupported" }
  | { status: "too-large"; cap: number }
  | { status: "loading"; loaded: number; total: number | null }
  | {
      status: "ready";
      kind: PreviewKind;
      blob: Blob;
      url: string;
      truncated: boolean;
    }
  | { status: "failed"; message: string | null; missing?: boolean };

type Settled =
  | Exclude<DrivePreviewState, { status: "ready" | "loading" }>
  | { status: "ready"; kind: PreviewKind; blob: Blob; truncated: boolean };

const PROGRESS_INTERVAL_MS = 100;

export function driveDownloadUrl(workspaceSlug: string, driveSlug: string, fileId: string): string {
  const params = new URLSearchParams({
    w: workspaceSlug,
    d: driveSlug,
    id: fileId,
  });
  return `/api/drive/download?${params.toString()}`;
}

export async function downloadDriveFile(
  workspaceSlug: string,
  driveSlug: string,
  fileId: string,
): Promise<void> {
  const url = driveDownloadUrl(workspaceSlug, driveSlug, fileId);
  try {
    const res = await fetch(`${url}&resolve=1`);
    const json: unknown = await res.json().catch(() => null);
    const target = res.ok ? downloadTargetSchema.safeParse(json).data : undefined;
    if (target) {
      window.location.href = target.url;
      return;
    }
    const body = routeErrorSchema.safeParse(json).data;
    toast.error(body?.error ?? "That file could not be downloaded", {
      action: body?.webUrl
        ? {
            label: "Open",
            onClick: () => window.open(body.webUrl, "_blank"),
          }
        : undefined,
    });
  } catch {
    toast.error("That file could not be downloaded");
  }
}

function providerFileId(entry: DriveEntryRow, driveSlug: string): string {
  const prefix = `${entry.driveId}:`;
  return driveSlug === ALL_DRIVES_SLUG && entry.id.startsWith(prefix)
    ? entry.id.slice(prefix.length)
    : entry.id;
}

async function routeError(res: Response): Promise<string | null> {
  try {
    return routeErrorSchema.safeParse(await res.json()).data?.error ?? null;
  } catch {
    return null;
  }
}

async function loadPreview(
  entry: DriveEntryRow,
  workspaceSlug: string,
  driveSlug: string,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
): Promise<Settled> {
  const kind = previewKind(entry);
  if (!kind) return { status: "unsupported" };
  const cap = PREVIEW_CAPS[kind];
  const truncate = truncatesAtCap(kind);
  if (!truncate && entry.size !== null && entry.size > cap) {
    return { status: "too-large", cap };
  }
  const type = previewBlobType(entry.name, kind);
  const freshness = { modifiedAt: entry.modifiedAt, size: entry.size };

  const key = await previewCacheKey(entry.driveId, providerFileId(entry, driveSlug));
  const cached = key ? await readCachedPreview(key, freshness) : null;
  if (cached) {
    return {
      status: "ready",
      kind,
      blob: new Blob([cached], { type }),
      truncated: false,
    };
  }

  let res: Response;
  try {
    res = await fetch(driveDownloadUrl(workspaceSlug, driveSlug, entry.id), {
      signal,
    });
  } catch {
    return { status: "failed", message: null };
  }
  if (!res.ok) {
    return { status: "failed", message: await routeError(res), missing: res.status === 404 };
  }
  if (!res.body) return { status: "failed", message: null };

  const knownTooLong = entry.size !== null && entry.size > cap;
  let writer: PreviewCacheWriter | null =
    key && !knownTooLong ? await openPreviewCacheWriter(key, freshness) : null;
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  let truncated = false;

  const dropWriter = async () => {
    const current = writer;
    writer = null;
    await current?.abort();
  };

  try {
    /* oxlint-disable eslint/no-await-in-loop -- a stream yields its chunks one read at a time */
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (loaded + value.byteLength > cap) {
        await reader.cancel().catch(() => {});
        await dropWriter();
        if (!truncate) return { status: "too-large", cap };
        chunks.push(value.slice(0, cap - loaded));
        loaded = cap;
        truncated = true;
        break;
      }
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded);
      if (writer) {
        await writer.write(value).catch(dropWriter);
      }
    }
    /* oxlint-enable eslint/no-await-in-loop */
  } catch {
    await dropWriter();
    return { status: "failed", message: null };
  }

  if (signal.aborted) {
    await dropWriter();
    return { status: "failed", message: null };
  }
  const finished = writer;
  if (finished) {
    finished.commit().catch(() => finished.abort());
  }
  return {
    status: "ready",
    kind,
    blob: new Blob(chunks, { type }),
    truncated,
  };
}

export function useDrivePreview(
  entry: DriveEntryRow,
  workspaceSlug: string,
  driveSlug: string,
): DrivePreviewState {
  const [settled, setSettled] = useState<{
    entry: DriveEntryRow;
    result: Settled;
    url: string | null;
  } | null>(null);
  const [progress, setProgress] = useState<{ entry: DriveEntryRow; loaded: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let lastProgress = 0;
    let url: string | null = null;
    void loadPreview(entry, workspaceSlug, driveSlug, controller.signal, (n) => {
      const now = Date.now();
      if (now - lastProgress < PROGRESS_INTERVAL_MS) return;
      lastProgress = now;
      setProgress({ entry, loaded: n });
    }).then((result) => {
      if (controller.signal.aborted) return;
      url = result.status === "ready" ? URL.createObjectURL(result.blob) : null;
      setSettled({ entry, result, url });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, workspaceSlug, driveSlug]);

  const current = settled?.entry === entry ? settled : null;
  const loaded = progress?.entry === entry ? progress.loaded : 0;
  if (!current) return { status: "loading", loaded, total: entry.size };
  if (current.result.status !== "ready") return current.result;
  if (!current.url) return { status: "loading", loaded, total: entry.size };
  return { ...current.result, url: current.url };
}
