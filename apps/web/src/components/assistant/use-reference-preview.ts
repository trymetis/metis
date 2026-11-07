"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { type ResolvedReference, unpackReferenceId } from "@/ai/references";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import { packContactRef } from "@/contacts/refs";
import { orpc, rpc } from "@/lib/orpc";
import type { DriveEntryRow } from "@/server/schema";
import { ALL_ADDRESS_BOOKS_SLUG, ALL_BOOKS, contactsPath } from "@/workspace/path";

export type ReferencePreview =
  | {
      kind: "file";
      entry: DriveEntryRow;
      driveSlug: string;
      providerLabel: string;
    }
  | { kind: "member"; userId: string; label: string };

export function useReferencePreview(workspaceSlug: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ReferencePreview | null>(null);
  const latest = useRef(0);

  const open = useCallback(
    async (ref: ResolvedReference) => {
      if (ref.type === "member") {
        latest.current++;
        setPreview({ kind: "member", userId: ref.id, label: ref.label });
        return;
      }
      if (ref.type === "contact") {
        const parts = unpackReferenceId(ref.id, 3);
        if (!parts) return;
        const [accountId, bookId, contactId] = parts;
        router.push(
          contactsPath(
            workspaceSlug,
            ALL_ADDRESS_BOOKS_SLUG,
            ALL_BOOKS,
            packContactRef({ accountId, bookId, contactId }),
          ),
        );
        return;
      }
      if (ref.type !== "file") return;
      const parts = unpackReferenceId(ref.id, 2);
      if (!parts) return;
      const [driveId, fileId] = parts;
      const request = ++latest.current;
      try {
        const { drives } = await queryClient.fetchQuery(
          rpc.workspaceDrives.list.queryOptions({ input: { workspaceSlug }, staleTime: 60_000 }),
        );
        const drive = drives.find((d) => d.driveId === driveId);
        if (!drive) {
          toast.error("That drive is no longer in this workspace");
          return;
        }
        const entry = await orpc.drive.get({
          workspaceSlug,
          driveSlug: drive.slug,
          fileId,
        });
        if (request !== latest.current || entry.kind !== "file") return;
        setPreview({
          kind: "file",
          entry,
          driveSlug: drive.slug,
          providerLabel: RESOURCE_PROVIDER_META.drive[drive.provider].label,
        });
      } catch {
        if (request === latest.current) toast.error("Could not open that file");
      }
    },
    [workspaceSlug, queryClient, router],
  );

  const close = useCallback(() => {
    latest.current++;
    setPreview(null);
  }, []);

  return { preview, open, close };
}
