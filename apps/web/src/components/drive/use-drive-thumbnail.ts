"use client";

import { useEffect, useRef, useState } from "react";

import { previewKind } from "@/drive/preview";
import { openPreviewCacheWriter, previewCacheKey, readCachedPreview } from "@/drive/preview-cache";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import type { DriveEntryRow } from "@/server/schema";

import { driveDownloadUrl } from "../drive-preview/use-drive-preview";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const THUMB_PX = 256;
const MAX_CONCURRENT = 3;

const unreadableDrives = new Set<string>();
const waiting: (() => void)[] = [];
let running = 0;

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function shrink(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, THUMB_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
}

type ThumbnailSource = Pick<DriveEntryRow, "id" | "driveId" | "driveSlug" | "modifiedAt" | "size">;

async function loadThumbnail(workspaceSlug: string, entry: ThumbnailSource): Promise<Blob | null> {
  const key = await previewCacheKey(entry.driveId, `thumbnail\n${entry.id}`);
  const freshness = { modifiedAt: entry.modifiedAt, size: entry.size };
  if (key) {
    const cached = await readCachedPreview(key, freshness);
    if (cached) return cached;
  }
  if (unreadableDrives.has(entry.driveId)) return null;

  return withSlot(async () => {
    let res: Response;
    try {
      res = await fetch(driveDownloadUrl(workspaceSlug, entry.driveSlug, entry.id));
    } catch {
      unreadableDrives.add(entry.driveId);
      return null;
    }
    if (!res.ok) return null;
    const thumbnail = await shrink(await res.blob());
    if (key) {
      const writer = await openPreviewCacheWriter(key, freshness);
      if (writer) {
        try {
          await writer.write(new Uint8Array(await thumbnail.arrayBuffer()));
          await writer.commit();
        } catch {
          await writer.abort();
        }
      }
    }
    return thumbnail;
  }).catch(() => null);
}

export function canThumbnail(entry: DriveEntryRow): boolean {
  return (
    previewKind(entry) === "image" &&
    entry.size !== null &&
    entry.size <= MAX_SOURCE_BYTES &&
    entry.modifiedAt !== null
  );
}

export function useDriveThumbnail(entry: DriveEntryRow, enabled: boolean) {
  const workspaceSlug = useWorkspaceSlug();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const wanted = enabled && canThumbnail(entry);

  useEffect(() => {
    const node = ref.current;
    if (!wanted || !node) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [wanted]);

  const { id, driveId, driveSlug, modifiedAt, size } = entry;
  useEffect(() => {
    if (!wanted || !visible) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const source = { id, driveId, driveSlug, modifiedAt, size };
    void loadThumbnail(workspaceSlug, source).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [wanted, visible, workspaceSlug, id, driveId, driveSlug, modifiedAt, size]);

  return { ref, url };
}
