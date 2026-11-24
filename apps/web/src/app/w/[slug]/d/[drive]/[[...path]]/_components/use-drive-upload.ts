"use client";

import { useCallback, useState } from "react";

import { uploadToDrive } from "@/drive/upload-client";
import { orpc } from "@/lib/orpc";
import type { DriveScope } from "@/server/schema";

export interface DriveUploadProgress {
  name: string;
  loaded: number;
  total: number;
}

interface UploadArgs {
  scope: DriveScope;
  parentId: string | null;
  files: File[];
}

export function useDriveUpload() {
  const [progress, setProgress] = useState<DriveUploadProgress | null>(null);

  const upload = useCallback(async ({ scope, parentId, files }: UploadArgs) => {
    /* oxlint-disable eslint/no-await-in-loop -- files upload one at a time, matching the single progress readout */
    for (const file of files) {
      setProgress({ name: file.name, loaded: 0, total: file.size });

      try {
        const session = await orpc.drive.beginUpload({
          ...scope,
          parentId,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
        });
        await uploadToDrive(session, file, file.name, (loaded) => {
          setProgress({ name: file.name, loaded, total: file.size });
        });
      } finally {
        setProgress(null);
      }
    }
    /* oxlint-enable eslint/no-await-in-loop */
  }, []);

  return { upload, progress };
}
