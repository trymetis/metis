import type { Route } from "next";

import { stashCalendarHandoff } from "@/calendar/pending-open";
import { stashDrivePreview } from "@/drive/pending-open";
import { stashPendingOpen } from "@/mail/pending-open";
import type { EventSearchHitDto, FileSearchHitDto, MailSearchHitDto } from "@/server/schema";
import { type ComposeInitial, type ComposeKind, useComposeStore } from "@/store/compose-store";
import {
  ALL_CALENDARS_SLUG,
  ALL_MAILBOXES_SLUG,
  calendarPath,
  drivePath,
  mailPath,
  mailRootPath,
} from "@/workspace/path";

export interface Navigator {
  push: (href: Route) => void;
}

export function bareMailId(hit: Pick<MailSearchHitDto, "id" | "mailboxId">) {
  const prefix = hit.mailboxId ? `${hit.mailboxId}:` : "";
  return prefix && hit.id.startsWith(prefix) ? hit.id.slice(prefix.length) : hit.id;
}

export function openMail(router: Navigator, workspaceSlug: string, hit: MailSearchHitDto) {
  const mailboxSlug = hit.mailboxSlug ?? ALL_MAILBOXES_SLUG;
  if (hit.states?.includes("scheduled")) {
    router.push(mailPath(workspaceSlug, mailboxSlug, "scheduled"));
    return;
  }
  if (hit.states?.includes("snoozed")) {
    router.push(mailPath(workspaceSlug, mailboxSlug, "snoozed"));
    return;
  }
  const threadPrefix = hit.mailboxId ? `${hit.mailboxId}:` : "";
  stashPendingOpen({
    ...hit,
    id: bareMailId(hit),
    threadId:
      hit.threadId && threadPrefix && hit.threadId.startsWith(threadPrefix)
        ? hit.threadId.slice(threadPrefix.length)
        : hit.threadId,
  });
  router.push(mailPath(workspaceSlug, mailboxSlug, hit.folder));
}

export function composeMail(
  router: Navigator,
  workspaceSlug: string,
  initial: ComposeInitial,
  mailboxSlug?: string,
  kind: ComposeKind = "new",
) {
  useComposeStore.getState().open(kind, initial);
  router.push(
    mailboxSlug ? mailPath(workspaceSlug, mailboxSlug, "inbox") : mailRootPath(workspaceSlug),
  );
}

export function openEvent(
  router: Navigator,
  workspaceSlug: string,
  event: EventSearchHitDto,
  edit = false,
) {
  const calendarSlug = event.accountSlug ?? ALL_CALENDARS_SLUG;
  stashCalendarHandoff(calendarSlug, { kind: "event", event, edit });
  router.push(calendarPath(workspaceSlug, calendarSlug));
}

export function newEventWith(router: Navigator, workspaceSlug: string, attendees: string[]) {
  stashCalendarHandoff(ALL_CALENDARS_SLUG, { kind: "draft", attendees });
  router.push(calendarPath(workspaceSlug, ALL_CALENDARS_SLUG));
}

export function openFile(router: Navigator, workspaceSlug: string, entry: FileSearchHitDto) {
  if (entry.kind === "folder") {
    router.push(drivePath(workspaceSlug, entry.driveSlug, [entry.id]));
    return;
  }
  stashDrivePreview(entry);
  router.push(drivePath(workspaceSlug, entry.driveSlug, entry.parentId ? [entry.parentId] : []));
}
