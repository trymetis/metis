"use client";

import type { ReactElement } from "react";

import type { CalendarProvider } from "@/connections/types";
import type { AttachableCalendar } from "@/server/schema";

import { type ConnectResourceCopy, ConnectResourceDialog } from "./connect-resource-dialog";

const COPY: ConnectResourceCopy = {
  pickTitle: "Add a calendar",
  connectTitle: "Connect a calendar account",
  pickDescription: "Pick an account you've already connected, or connect a new one.",
  connectDescription: "You'll sign in with the provider, then land back in this workspace.",
  credentialsDescription:
    "Enter your login for this server. It is verified before anything is saved.",
  standaloneDescription:
    "Access covers every calendar on that account. You choose which ones a workspace sees afterwards.",
  emptyAttachable: "Every calendar account you have is already here.",
  connectNew: "Connect a new account",
};

interface CalendarDialogProps {
  children: ReactElement;
  connectHref: (provider: CalendarProvider) => string;
  attachable?: AttachableCalendar[];
  policyNotice?: string | null;
  workspaceSlug?: string;
  onAttach?: (calendarId: string) => Promise<void>;
}

export function CalendarDialog({ children, attachable, ...rest }: CalendarDialogProps) {
  return (
    <ConnectResourceDialog
      resource="calendar"
      copy={COPY}
      attachable={attachable?.map((calendar) => ({
        id: calendar.calendarId,
        email: calendar.email,
        server: calendar.server,
        provider: calendar.provider,
      }))}
      {...rest}
    >
      {children}
    </ConnectResourceDialog>
  );
}
