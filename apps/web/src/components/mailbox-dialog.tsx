"use client";

import type { ReactElement } from "react";

import type { MailProvider } from "@/connections/types";
import type { AttachableMailbox } from "@/server/schema";

import { type ConnectResourceCopy, ConnectResourceDialog } from "./connect-resource-dialog";

const COPY: ConnectResourceCopy = {
  pickTitle: "Add a mailbox",
  connectTitle: "Connect a mailbox",
  pickDescription: "Pick one you've already connected, or connect a new one.",
  connectDescription: "You'll sign in with the provider, then land back in this workspace.",
  credentialsDescription:
    "Enter your login for this server. It is verified before anything is saved.",
  standaloneDescription:
    "The mailbox is added to your account. You choose which workspaces use it afterwards.",
  emptyAttachable: "Every mailbox on your account is already here.",
  connectNew: "Connect a new mailbox",
};

interface MailboxDialogProps {
  children: ReactElement;
  connectHref: (provider: MailProvider) => string;
  attachable?: AttachableMailbox[];
  policyNotice?: string | null;
  workspaceSlug?: string;
  onAttach?: (mailboxId: string) => Promise<void>;
}

export function MailboxDialog({ children, attachable, ...rest }: MailboxDialogProps) {
  return (
    <ConnectResourceDialog
      resource="mailbox"
      copy={COPY}
      attachable={attachable?.map((mailbox) => ({
        id: mailbox.mailboxId,
        email: mailbox.email,
        server: mailbox.server,
        provider: mailbox.provider,
      }))}
      {...rest}
    >
      {children}
    </ConnectResourceDialog>
  );
}
