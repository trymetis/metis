"use client";

import type { ReactElement } from "react";

import type { DriveProvider } from "@/connections/types";
import type { AttachableDrive } from "@/server/schema";

import { type ConnectResourceCopy, ConnectResourceDialog } from "./connect-resource-dialog";

const COPY: ConnectResourceCopy = {
  pickTitle: "Add a drive",
  connectTitle: "Connect a drive account",
  pickDescription: "Pick an account you've already connected, or connect a new one.",
  connectDescription: "You'll sign in with the provider, then land back in this workspace.",
  credentialsDescription:
    "Enter your login for this server. It is verified before anything is saved.",
  standaloneDescription:
    "Access covers every file on that account. Files are read and written straight from the provider.",
  emptyAttachable: "Every drive account you have is already here.",
  connectNew: "Connect a new account",
};

interface DriveDialogProps {
  children: ReactElement;
  connectHref: (provider: DriveProvider) => string;
  attachable?: AttachableDrive[];
  policyNotice?: string | null;
  workspaceSlug?: string;
  onAttach?: (driveId: string) => Promise<void>;
}

export function DriveDialog({ children, attachable, ...rest }: DriveDialogProps) {
  return (
    <ConnectResourceDialog
      resource="drive"
      copy={COPY}
      attachable={attachable?.map((drive) => ({
        id: drive.driveId,
        email: drive.email,
        server: drive.server,
        provider: drive.provider,
      }))}
      {...rest}
    >
      {children}
    </ConnectResourceDialog>
  );
}
