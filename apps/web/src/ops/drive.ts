import "server-only";
import { z } from "zod";

import {
  type DriveSurface,
  driveSurfaceFor,
  type ResolvedDrive,
  sourceError,
} from "@/drive/aggregate";
import { listDrivePins, pinDriveFolder, unpinDriveFolder } from "@/drive/pins";
import { driveQuotas } from "@/drive/quota";
import { looksTextual, TEXT_LIMIT } from "@/lib/file-utils";
import { truncate } from "@/lib/utils";
import { driveEntrySchema, driveProviderSchema, driveSourceErrorSchema } from "@/server/schema";
import type { DriveSourceError, TaggedDriveEntry } from "@/types/drive";

import { failureOutput, orFailure, type Output } from "./output";

export const entrySummaryOutput = z.object({
  fileId: z.string(),
  name: z.string(),
  kind: driveEntrySchema.shape.kind,
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  modifiedAt: z.string().nullable(),
  driveId: z.string(),
});

export const listDrivesOutput = z.object({
  count: z.number(),
  drives: z.array(
    z.object({
      driveId: z.string(),
      email: z.string(),
      provider: driveProviderSchema,
      scopedToFolders: z.boolean(),
    }),
  ),
});

export const listFolderOutput = z.object({
  count: z.number(),
  atRoot: z.boolean(),
  entries: z.array(entrySummaryOutput),
  cursor: z.string().nullable(),
  errors: z.array(driveSourceErrorSchema).optional(),
});

export const searchFilesOutput = listFolderOutput.omit({ atRoot: true });

export const searchAcrossOutput = z.object({
  count: z.number(),
  entries: z.array(entrySummaryOutput),
  errors: z.array(driveSourceErrorSchema).optional(),
});

export const getFileOutput = entrySummaryOutput.extend({
  parentFolderId: z.string().nullable(),
  providerUrl: z.string().nullable(),
  isProviderDocument: z.boolean(),
});

export const getFileTextOutput = z.union([
  z.object({ fileId: z.string(), name: z.string(), truncated: z.boolean(), text: z.string() }),
  failureOutput.extend({ providerUrl: z.string().nullable().optional() }),
]);

export const createFolderOutput = z.object({
  created: z.literal(true),
  fileId: z.string(),
  name: z.string(),
  driveId: z.string(),
});

export const renameFileOutput = z.object({
  renamed: z.literal(true),
  fileId: z.string(),
  name: z.string(),
});

export const moveFileOutput = z.object({
  moved: z.literal(true),
  fileId: z.string(),
  parentFolderId: z.string().nullable(),
});

export const deleteFileOutput = z.object({
  deleted: z.literal(true),
  fileId: z.string(),
  name: z.string(),
});

export const listPinsOutput = z.object({
  count: z.number(),
  pins: z.array(
    z.object({ pinId: z.string(), driveId: z.string(), folderId: z.string(), label: z.string() }),
  ),
});

export const pinFolderOutput = orFailure(
  z.object({
    pinned: z.literal(true),
    driveId: z.string(),
    folderId: z.string(),
    label: z.string(),
  }),
);

export const unpinFolderOutput = orFailure(
  z.object({ unpinned: z.literal(true), pinId: z.string() }),
);

export const getDriveQuotaOutput = z.object({
  quotas: z.array(
    z.object({
      driveId: z.string(),
      email: z.string(),
      provider: driveProviderSchema,
      usedBytes: z.number().nullable(),
      totalBytes: z.number().nullable(),
    }),
  ),
  errors: z
    .array(z.object({ driveId: z.string(), email: z.string(), message: z.string() }))
    .optional(),
});

const STREAM_BYTE_LIMIT = TEXT_LIMIT * 4 + 4;
const STREAM_TIMEOUT_MS = 30_000;

async function readStreamText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < STREAM_BYTE_LIMIT) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a stream yields its chunks one read at a time
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function entrySummary(entry: TaggedDriveEntry): Output<typeof entrySummaryOutput> {
  return {
    fileId: entry.id,
    name: entry.name,
    kind: entry.kind,
    mimeType: entry.mimeType,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    driveId: entry.driveId,
  };
}

export function listDrives(drives: ResolvedDrive[]): Output<typeof listDrivesOutput> {
  return {
    count: drives.length,
    drives: drives.map((drive) => ({
      driveId: drive.driveId,
      email: drive.email,
      provider: drive.provider,
      scopedToFolders: drive.visibleRootIds.length > 0,
    })),
  };
}

export async function listFolder(
  view: DriveSurface,
  args: { folderId?: string; cursor?: string },
): Promise<Output<typeof listFolderOutput>> {
  const listing = await view.listFolder(args.folderId ?? null, args.cursor);
  return {
    count: listing.entries.length,
    atRoot: !args.folderId,
    entries: listing.entries.map(entrySummary),
    cursor: listing.cursor,
    errors: listing.driveErrors,
  };
}

export async function searchFiles(
  view: DriveSurface,
  args: { query: string; cursor?: string },
): Promise<Output<typeof searchFilesOutput>> {
  const listing = await view.search(args.query, args.cursor);
  return {
    count: listing.entries.length,
    entries: listing.entries.map(entrySummary),
    cursor: listing.cursor,
    errors: listing.driveErrors,
  };
}

export async function searchAcross(
  drives: ResolvedDrive[],
  query: string,
): Promise<Output<typeof searchAcrossOutput>> {
  const errors: DriveSourceError[] = [];
  const groups = await Promise.all(
    drives.map(async (drive) => {
      try {
        const listing = await driveSurfaceFor(drive).search(query);
        if (listing.driveErrors) errors.push(...listing.driveErrors);
        return listing.entries.map(entrySummary);
      } catch (err) {
        errors.push(sourceError(drive, err));
        return [];
      }
    }),
  );
  const entries = groups.flat();
  return { count: entries.length, entries, errors: errors.length > 0 ? errors : undefined };
}

export async function getFile(
  view: DriveSurface,
  fileId: string,
): Promise<Output<typeof getFileOutput>> {
  const entry = await view.getEntry(fileId);
  return {
    ...entrySummary(entry),
    parentFolderId: entry.parentId,
    providerUrl: entry.webUrl,
    isProviderDocument: entry.native,
  };
}

export async function getFileText(
  view: DriveSurface,
  fileId: string,
): Promise<Output<typeof getFileTextOutput>> {
  const entry = await view.getEntry(fileId);

  if (entry.kind === "folder") {
    return { error: "That is a folder, not a file" };
  }
  if (!looksTextual(entry.name, entry.mimeType)) {
    return {
      error:
        "That file is not plain text. Use getFile for its details, or open it at the provider.",
      providerUrl: entry.webUrl,
    };
  }

  const target = await view.getDownloadTarget(fileId);
  if (target.kind === "unavailable") {
    return { error: target.reason, providerUrl: target.webUrl };
  }

  const res = await fetch(target.url, {
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    return { error: `The provider refused the download (${res.status})` };
  }
  const text = await readStreamText(res.body);

  return {
    fileId: entry.id,
    name: entry.name,
    truncated: text.length > TEXT_LIMIT,
    text: truncate(text, TEXT_LIMIT),
  };
}

export async function createFolder(
  view: DriveSurface,
  args: { parentFolderId?: string; name: string },
): Promise<Output<typeof createFolderOutput>> {
  const entry = await view.createFolder(args.parentFolderId ?? null, args.name);
  return {
    created: true,
    fileId: entry.id,
    name: entry.name,
    driveId: entry.driveId,
  };
}

export async function renameFile(
  view: DriveSurface,
  args: { fileId: string; name: string },
): Promise<Output<typeof renameFileOutput>> {
  await view.rename(args.fileId, args.name);
  return { renamed: true, fileId: args.fileId, name: args.name };
}

export async function moveFile(
  view: DriveSurface,
  args: { fileId: string; parentFolderId?: string },
): Promise<Output<typeof moveFileOutput>> {
  await view.move(args.fileId, args.parentFolderId ?? null);
  return {
    moved: true,
    fileId: args.fileId,
    parentFolderId: args.parentFolderId ?? null,
  };
}

export async function deleteFile(
  view: DriveSurface,
  fileId: string,
): Promise<Output<typeof deleteFileOutput>> {
  const entry = await view.getEntry(fileId);
  await view.delete(fileId);
  return { deleted: true, fileId, name: entry.name };
}

export async function listPins(
  userId: string,
  drives: ResolvedDrive[],
): Promise<Output<typeof listPinsOutput>> {
  const pins = await listDrivePins(userId, drives);
  return {
    count: pins.length,
    pins: pins.map((p) => ({
      pinId: p.id,
      driveId: p.driveId,
      folderId: p.folderId,
      label: p.label,
    })),
  };
}

export async function pinFolder(
  userId: string,
  view: DriveSurface,
  args: { driveId: string; folderId: string; label?: string },
): Promise<Output<typeof pinFolderOutput>> {
  const entry = await view.getEntry(args.folderId);
  if (entry.kind !== "folder") {
    return {
      error: "That is a file, not a folder — only folders can be pinned",
    };
  }
  const label = args.label ?? entry.name;
  await pinDriveFolder({
    userId,
    driveId: args.driveId,
    folderId: entry.id,
    label,
  });
  return { pinned: true, driveId: args.driveId, folderId: entry.id, label };
}

export async function unpinFolder(
  userId: string,
  pinId: string,
): Promise<Output<typeof unpinFolderOutput>> {
  const removed = await unpinDriveFolder({ userId, pinId });
  if (!removed) return { error: `Unknown pinId "${pinId}" — see listPins` };
  return { unpinned: true, pinId };
}

export async function getDriveQuota(
  drives: ResolvedDrive[],
): Promise<Output<typeof getDriveQuotaOutput>> {
  const { quotas, driveErrors } = await driveQuotas(drives);
  return {
    quotas: quotas.map((q) => ({
      driveId: q.driveId,
      email: q.email,
      provider: q.provider,
      usedBytes: q.usedBytes,
      totalBytes: q.totalBytes,
    })),
    errors: driveErrors?.map((e) => ({
      driveId: e.driveId,
      email: e.email,
      message: e.message,
    })),
  };
}
