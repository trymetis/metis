"use client";

import type { ReactElement } from "react";

import type { AddressBookProvider } from "@/connections/types";
import type { AttachableAddressBook } from "@/server/schema";

import { type ConnectResourceCopy, ConnectResourceDialog } from "./connect-resource-dialog";

const COPY: ConnectResourceCopy = {
  pickTitle: "Add an address book",
  connectTitle: "Connect an address book",
  pickDescription: "Pick an account you've already connected, or connect a new one.",
  connectDescription: "You'll sign in with the provider, then land back in this workspace.",
  credentialsDescription:
    "Enter your login for this server. It is verified before anything is saved.",
  standaloneDescription:
    "Access covers every address book on that account — you choose which ones a workspace sees afterwards.",
  emptyAttachable: "Every address book you have is already here.",
  connectNew: "Connect a new account",
};

interface AddressBookDialogProps {
  children: ReactElement;
  connectHref: (provider: AddressBookProvider) => string;
  attachable?: AttachableAddressBook[];
  policyNotice?: string | null;
  workspaceSlug?: string;
  onAttach?: (addressBookId: string) => Promise<void>;
}

export function AddressBookDialog({ children, attachable, ...rest }: AddressBookDialogProps) {
  return (
    <ConnectResourceDialog
      resource="addressbook"
      copy={COPY}
      attachable={attachable?.map((book) => ({
        id: book.addressBookId,
        email: book.email,
        server: book.server,
        provider: book.provider,
      }))}
      {...rest}
    >
      {children}
    </ConnectResourceDialog>
  );
}
