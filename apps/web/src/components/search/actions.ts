"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Archive,
  ArrowRight,
  Ban,
  BookUser,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Filter,
  FolderInput,
  History,
  Link2,
  Mail,
  MailOpen,
  Pencil,
  Pin,
  PinOff,
  Play,
  Power,
  Reply,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Unplug,
  UserMinus,
  X,
} from "lucide-react";
import type { Route } from "next";
import { toast } from "sonner";

import { packReferenceId, type ResolvedReference } from "@/ai/references";
import { stashCalendarHandoff } from "@/calendar/pending-open";
import { setPendingDraft } from "@/components/assistant/pending";
import { matchHref } from "@/components/contacts/use-save-contact";
import { downloadDriveFile } from "@/components/drive-preview/use-drive-preview";
import type { MemberAdmin } from "@/components/members/member-admin";
import { packBookRef } from "@/contacts/refs";
import { customLabelsQuery } from "@/hooks/use-custom-labels";
import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient, refreshQueries } from "@/lib/query-client";
import { route } from "@/lib/route";
import { LABEL_OPTIONS } from "@/mail/label-meta";
import type {
  EventSearchHitDto,
  FileSearchHitDto,
  LocalSearchHit,
  MailSearchHitDto,
} from "@/server/schema";
import type { WorkspaceRole } from "@/types/workspace";
import {
  ALL_MAILBOXES_SLUG,
  assistantPath,
  calendarPath,
  contactsPath,
  drivePath,
  mailPath,
  workflowEditPath,
  workflowPath,
  workflowRunPath,
  workspaceSettingsPath,
} from "@/workspace/path";

import type { ClientEntry } from "./entries";
import type { SearchItem } from "./items";
import {
  bareMailId,
  composeMail,
  type Navigator,
  newEventWith,
  openEvent,
  openFile,
  openMail,
} from "./navigate";
import { anyOf, personQuery, qualifier } from "./queries";

export interface SearchAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void | Promise<void>;
  destructive?: boolean;
  keepOpen?: boolean;
}

export interface SearchPrompts {
  askText: (opts: {
    title: string;
    label: string;
    initial?: string;
    confirm: string;
  }) => Promise<string | null>;
  askChoice: (opts: {
    title: string;
    options: { value: string; label: string }[];
    confirm: string;
  }) => Promise<string | null>;
  pickFolder: (entry: FileSearchHitDto) => Promise<{ parentId: string | null } | null>;
  confirm: (opts: { title: string; body: string; confirm: string }) => Promise<boolean>;
}

export interface ActionContext {
  router: Navigator;
  workspaceSlug: string;
  role: WorkspaceRole;
  ai: boolean;
  prompts: SearchPrompts;
  admin: MemberAdmin;
  setQuery: (query: string) => void;
  close: () => void;
  refresh: () => void;
  runClient: (entry: ClientEntry) => void;
}

function act(
  id: string,
  label: string,
  icon: LucideIcon,
  run: () => void | Promise<void>,
  extra: Partial<SearchAction> = {},
): SearchAction {
  return { id, label, icon, run, ...extra };
}

async function attempt(ctx: ActionContext, fn: () => Promise<unknown>, done: string) {
  try {
    await fn();
    toast.success(done);
    ctx.refresh();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "That did not work");
  }
}

function ask(ctx: ActionContext, reference: ResolvedReference): SearchAction {
  return act("ask", "Ask the assistant", Sparkles, () => {
    setPendingDraft([reference]);
    ctx.router.push(assistantPath(ctx.workspaceSlug));
  });
}

function filterBy(ctx: ActionContext, query: string, label: string) {
  return act(`filter:${query}`, label, Filter, () => ctx.setQuery(query), {
    keepOpen: true,
  });
}

function copy(text: string, label = "Copy email"): SearchAction {
  return act("copy", label, Copy, () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy"));
  });
}

function nextMorning(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  at.setHours(8, 0, 0, 0);
  return at.toISOString();
}

function nextMonday(): string {
  const at = new Date();
  const ahead = (8 - at.getDay()) % 7 || 7;
  at.setDate(at.getDate() + ahead);
  at.setHours(8, 0, 0, 0);
  return at.toISOString();
}

function mailActions(ctx: ActionContext, hit: MailSearchHitDto): SearchAction[] {
  const mailboxSlug = hit.mailboxSlug ?? ALL_MAILBOXES_SLUG;
  const scope = { workspaceSlug: ctx.workspaceSlug, mailboxSlug };
  const id = bareMailId(hit);
  const open = act("open", "Open", MailOpen, () => openMail(ctx.router, ctx.workspaceSlug, hit));

  if (hit.states?.includes("scheduled") && hit.scheduleId) {
    const scheduleId = hit.scheduleId;
    return [
      open,
      act(
        "cancel",
        "Cancel the send",
        Ban,
        async () => {
          if (
            await ctx.prompts.confirm({
              title: "Cancel this scheduled send?",
              body: "The message will not be sent.",
              confirm: "Cancel send",
            })
          ) {
            await attempt(
              ctx,
              async () => {
                await orpc.mail.scheduledSend.cancel({ ...scope, id: scheduleId });
                void refreshQueries(rpc.mail.scheduledSend.list.key());
              },
              "Send cancelled",
            );
          }
        },
        { destructive: true, keepOpen: true },
      ),
      ...(hit.unconfirmed
        ? [
            act(
              "retry",
              "Retry the send",
              RotateCcw,
              () =>
                attempt(
                  ctx,
                  async () => {
                    const result = await orpc.mail.scheduledSend.retry({
                      ...scope,
                      id: scheduleId,
                    });
                    void refreshQueries(rpc.mail.scheduledSend.list.key());
                    return result;
                  },
                  "Send retried",
                ),
              { keepOpen: true },
            ),
          ]
        : []),
    ];
  }

  const actions: SearchAction[] = [
    open,
    act("reply", "Reply", Reply, () =>
      composeMail(
        ctx.router,
        ctx.workspaceSlug,
        {
          to: hit.from,
          subject: /^re:/i.test(hit.subject) ? hit.subject : `Re: ${hit.subject}`,
          inReplyTo: hit.messageIdHeader,
          references: hit.references
            ? `${hit.references} ${hit.messageIdHeader ?? ""}`.trim()
            : hit.messageIdHeader,
          replyToMessageId: id,
        },
        mailboxSlug,
      ),
    ),
  ];
  if (hit.folder !== "archive") {
    actions.push(
      act(
        "archive",
        "Archive",
        Archive,
        () => attempt(ctx, () => orpc.mail.messages.archive({ ...scope, id }), "Archived"),
        { keepOpen: true },
      ),
    );
  }
  actions.push(
    act(
      "star",
      hit.isStarred ? "Unstar" : "Star",
      Star,
      () =>
        attempt(
          ctx,
          () => orpc.mail.messages.star({ ...scope, id, starred: !hit.isStarred }),
          hit.isStarred ? "Unstarred" : "Starred",
        ),
      { keepOpen: true },
    ),
    act(
      "read",
      hit.isRead ? "Mark unread" : "Mark read",
      Mail,
      () =>
        attempt(
          ctx,
          () =>
            orpc.mail.messages.markRead({
              ...scope,
              ids: [id],
              read: !hit.isRead,
            }),
          hit.isRead ? "Marked unread" : "Marked read",
        ),
      { keepOpen: true },
    ),
    act(
      "snooze-tomorrow",
      "Snooze until tomorrow",
      AlarmClock,
      () =>
        attempt(
          ctx,
          () =>
            orpc.mail.messages.snooze({ ...scope, id, folder: hit.folder, wakeAt: nextMorning(1) }),
          "Snoozed until tomorrow",
        ),
      { keepOpen: true },
    ),
    act(
      "snooze-week",
      "Snooze until next week",
      AlarmClock,
      () =>
        attempt(
          ctx,
          () =>
            orpc.mail.messages.snooze({ ...scope, id, folder: hit.folder, wakeAt: nextMonday() }),
          "Snoozed until next week",
        ),
      { keepOpen: true },
    ),
    act(
      "label",
      "Add a label",
      Tag,
      async () => {
        const custom = await getQueryClient()
          .fetchQuery({ ...customLabelsQuery(scope), staleTime: 60_000 })
          .then((res) => res.labels)
          .catch(() => []);
        const label = await ctx.prompts.askChoice({
          title: "Add a label",
          options: [...LABEL_OPTIONS, ...custom].map((l) => ({
            value: l.key,
            label: l.name,
          })),
          confirm: "Add label",
        });
        if (!label) return;
        await attempt(
          ctx,
          () => orpc.mail.labels.setOnMessage({ ...scope, id, label }),
          "Label added",
        );
      },
      { keepOpen: true },
    ),
  );
  if (ctx.ai && hit.ai && hit.mailboxId) {
    actions.push(
      ask(ctx, {
        type: "email",
        id: packReferenceId(hit.mailboxId, id),
        label: hit.subject,
        detail: hit.mailboxEmail,
      }),
    );
  }
  if (hit.from) {
    actions.push(filterBy(ctx, qualifier("from", hit.from), "Filter by sender"));
  }
  return actions;
}

function eventActions(ctx: ActionContext, hit: EventSearchHitDto): SearchAction[] {
  const scope = {
    workspaceSlug: ctx.workspaceSlug,
    calendarSlug: hit.accountSlug ?? "all",
    accountId: hit.accountId,
    calendarId: hit.calendarId,
    eventId: hit.id,
  };
  const respond = (
    response: "accepted" | "declined" | "tentative",
    label: string,
    icon: LucideIcon,
  ) =>
    act(
      `rsvp:${response}`,
      label,
      icon,
      () =>
        attempt(ctx, () => orpc.calendarEvents.respond({ ...scope, response }), "Response sent"),
      { keepOpen: true },
    );
  const people = [
    ...(hit.attendees ?? []).map((a) => a.email),
    ...(hit.organizer ? [hit.organizer.email] : []),
  ].filter(Boolean);
  const actions: SearchAction[] = [
    act("open", "Open", ArrowRight, () => openEvent(ctx.router, ctx.workspaceSlug, hit)),
    respond("accepted", "Going", CalendarCheck),
    respond("tentative", "Maybe", CalendarPlus),
    respond("declined", "Not going", CalendarX),
    act("edit", "Edit", Pencil, () => openEvent(ctx.router, ctx.workspaceSlug, hit, true)),
    act(
      "delete",
      "Delete",
      Trash2,
      async () => {
        if (
          await ctx.prompts.confirm({
            title: `Delete ${hit.title || "this event"}?`,
            body: "The event is deleted at the calendar provider and cannot be brought back here.",
            confirm: "Delete event",
          })
        ) {
          await attempt(ctx, () => orpc.calendarEvents.delete(scope), "Event deleted");
        }
      },
      { destructive: true, keepOpen: true },
    ),
  ];
  if (ctx.ai && hit.ai && hit.accountId) {
    actions.push(
      ask(ctx, {
        type: "event",
        id: packReferenceId(hit.accountId, hit.calendarId, hit.id),
        label: hit.title || "Event",
        detail: hit.accountName ?? hit.accountEmail,
      }),
    );
  }
  if (people.length > 0) {
    actions.push(
      filterBy(ctx, anyOf("attendee", [...new Set(people)]), "Search with the attendees"),
    );
  }
  return actions;
}

function fileActions(ctx: ActionContext, hit: FileSearchHitDto): SearchAction[] {
  const scope = { workspaceSlug: ctx.workspaceSlug, driveSlug: hit.driveSlug };
  const folder = hit.kind === "folder";
  const actions: SearchAction[] = [
    act("open", folder ? "Open folder" : "Preview", Eye, () =>
      openFile(ctx.router, ctx.workspaceSlug, hit),
    ),
  ];
  if (!folder) {
    actions.push(
      act(
        "download",
        "Download",
        Download,
        () => downloadDriveFile(ctx.workspaceSlug, hit.driveSlug, hit.id),
        { keepOpen: true },
      ),
    );
  }
  actions.push(
    act(
      "rename",
      "Rename",
      Pencil,
      async () => {
        const name = await ctx.prompts.askText({
          title: "Rename",
          label: "Name",
          initial: hit.name,
          confirm: "Rename",
        });
        if (!name || name === hit.name) return;
        await attempt(ctx, () => orpc.drive.rename({ ...scope, fileId: hit.id, name }), "Renamed");
      },
      { keepOpen: true },
    ),
    act(
      "move",
      "Move",
      FolderInput,
      async () => {
        const target = await ctx.prompts.pickFolder(hit);
        if (!target) return;
        await attempt(
          ctx,
          () =>
            orpc.drive.move({
              ...scope,
              fileId: hit.id,
              parentId: target.parentId,
            }),
          "Moved",
        );
      },
      { keepOpen: true },
    ),
  );
  if (folder) {
    actions.push(
      hit.pinned
        ? act(
            "unpin",
            "Unpin",
            PinOff,
            async () => {
              const { pins } = await orpc.drive.pins(scope);
              const pin = pins.find((p) => p.folderId === hit.id && p.driveId === hit.driveId);
              if (!pin) return;
              await attempt(ctx, () => orpc.drive.unpin({ ...scope, pinId: pin.id }), "Unpinned");
            },
            { keepOpen: true },
          )
        : act(
            "pin",
            "Pin",
            Pin,
            () =>
              attempt(
                ctx,
                () =>
                  orpc.drive.pin({
                    ...scope,
                    driveId: hit.driveId,
                    folderId: hit.id,
                    label: hit.name,
                  }),
                "Pinned",
              ),
            { keepOpen: true },
          ),
    );
  }
  actions.push(
    act(
      "delete",
      "Delete",
      Trash2,
      async () => {
        if (
          await ctx.prompts.confirm({
            title: `Delete ${hit.name}?`,
            body: "Google Drive and OneDrive move it to the trash. Every other drive deletes it for good.",
            confirm: "Delete",
          })
        ) {
          await attempt(ctx, () => orpc.drive.delete({ ...scope, fileId: hit.id }), "Deleted");
        }
      },
      { destructive: true, keepOpen: true },
    ),
  );
  const webUrl = hit.webUrl;
  if (!folder && webUrl) {
    actions.push(
      act("attach", "Attach to a new mail", Link2, () =>
        composeMail(ctx.router, ctx.workspaceSlug, {
          subject: hit.name,
          bodyHtml: `<p><a href="${encodeURI(webUrl)}">${escapeHtml(hit.name)}</a></p>`,
        }),
      ),
    );
  }
  if (ctx.ai && hit.ai && !folder) {
    actions.push(
      ask(ctx, {
        type: "file",
        id: packReferenceId(hit.driveId, hit.id),
        label: hit.name,
        detail: hit.driveSlug,
      }),
    );
  }
  if (hit.parentName) {
    actions.push(filterBy(ctx, qualifier("drive-folder", hit.parentName), "Filter by folder"));
  }
  return actions;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function personActions(ctx: ActionContext, email: string, label: string): SearchAction[] {
  return [
    act("email", "Email", Mail, () => composeMail(ctx.router, ctx.workspaceSlug, { to: email })),
    act("invite", "Invite to an event", CalendarPlus, () =>
      newEventWith(ctx.router, ctx.workspaceSlug, [email]),
    ),
    filterBy(ctx, personQuery(email), `Search everything with ${label}`),
    copy(email),
  ];
}

function localActions(ctx: ActionContext, hit: LocalSearchHit): SearchAction[] {
  const ws = ctx.workspaceSlug;
  const go = (href: Route, label = "Open", icon: LucideIcon = ArrowRight) =>
    act("open", label, icon, () => ctx.router.push(href));
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  switch (hit.kind) {
    case "chat":
      return [
        go(assistantPath(ws, hit.threadId)),
        act(
          "rename",
          "Rename",
          Pencil,
          async () => {
            const title = await ctx.prompts.askText({
              title: "Rename chat",
              label: "Title",
              initial: hit.title,
              confirm: "Rename",
            });
            if (!title) return;
            await attempt(
              ctx,
              () =>
                orpc.assistant.renameThread({
                  workspaceSlug: ws,
                  threadId: hit.threadId,
                  title,
                }),
              "Renamed",
            );
          },
          { keepOpen: true },
        ),
        act(
          "delete",
          "Delete",
          Trash2,
          async () => {
            if (
              await ctx.prompts.confirm({
                title: `Delete “${hit.title}”?`,
                body: "The chat and its history are deleted for good.",
                confirm: "Delete chat",
              })
            ) {
              await attempt(
                ctx,
                () =>
                  orpc.assistant.deleteThread({
                    workspaceSlug: ws,
                    threadId: hit.threadId,
                  }),
                "Chat deleted",
              );
            }
          },
          { destructive: true, keepOpen: true },
        ),
      ];

    case "member": {
      if (hit.invited) {
        const inviteId = hit.inviteId;
        return [
          copy(hit.email),
          ...(ctx.admin.canRevoke && inviteId
            ? [
                act(
                  "revoke",
                  "Revoke the invite",
                  X,
                  () => ctx.admin.revoke({ id: inviteId, email: hit.email }),
                  { destructive: true, keepOpen: true },
                ),
              ]
            : []),
        ];
      }
      const userId = hit.userId;
      const member =
        hit.memberId !== null
          ? {
              memberId: hit.memberId,
              userId: hit.userId,
              email: hit.email,
              name: hit.name,
              role: hit.role,
            }
          : null;
      const actions: SearchAction[] = [...personActions(ctx, hit.email, hit.name || hit.email)];
      if (ctx.ai && userId) {
        actions.splice(
          actions.length - 1,
          0,
          ask(ctx, {
            type: "member",
            id: userId,
            label: hit.name || hit.email,
            detail: hit.email,
          }),
        );
      }
      if (member && ctx.admin.canChangeRole(member)) {
        const next = member.role === "admin" ? "member" : "admin";
        actions.push(
          act(
            "role",
            next === "admin" ? "Make admin" : "Make member",
            Shield,
            () => ctx.admin.setRole(member, next),
            { keepOpen: true },
          ),
        );
      }
      if (member && ctx.admin.canTransfer(member)) {
        actions.push(
          act("transfer", "Transfer ownership", Shield, () => ctx.admin.transfer(member), {
            keepOpen: true,
          }),
        );
      }
      if (member && ctx.admin.canRemove(member)) {
        actions.push(
          act("remove", "Remove from workspace", UserMinus, () => ctx.admin.remove(member), {
            destructive: true,
            keepOpen: true,
          }),
        );
      }
      return actions;
    }

    case "contact": {
      const list = hit.email ? personActions(ctx, hit.email, hit.name || hit.email) : [];
      const search = list.find((a) => a.id.startsWith("filter:"));
      const ordered = [
        ...(search ? [search, ...list.filter((a) => a !== search)] : list),
        ...(hit.phone ? [copy(hit.phone, "Copy phone number")] : []),
      ];
      if (!hit.saved) return ordered;
      return [
        go(
          route(
            matchHref(ws, {
              email: hit.email,
              name: hit.name ?? hit.email,
              ...hit.saved,
            }),
          ),
          "Open contact",
          BookUser,
        ),
        ...ordered,
      ];
    }

    case "workflow":
      return [
        go(workflowEditPath(ws, hit.workflowId), "Open the builder"),
        act(
          "toggle",
          hit.enabled ? "Turn off" : "Turn on",
          Power,
          () =>
            attempt(
              ctx,
              () =>
                orpc.workflows.toggle({
                  workspaceSlug: ws,
                  id: hit.workflowId,
                  enabled: !hit.enabled,
                }),
              hit.enabled ? "Turned off" : "Turned on",
            ),
          { keepOpen: true },
        ),
        act(
          "run",
          "Run now",
          Play,
          () =>
            attempt(
              ctx,
              () => orpc.workflows.run({ workspaceSlug: ws, id: hit.workflowId }),
              "Run queued",
            ),
          { keepOpen: true },
        ),
        go(workflowPath(ws, "history"), "Open history", History),
      ];

    case "run": {
      const actions = [go(workflowRunPath(ws, hit.runId), "Open the run")];
      if (hit.status === "blocked" || hit.status === "failed") {
        actions.push(
          act(
            "resume",
            "Resume",
            Play,
            () =>
              attempt(
                ctx,
                () =>
                  orpc.workflows.resumeRun({
                    workspaceSlug: ws,
                    runId: hit.runId,
                  }),
                "Run resumed",
              ),
            { keepOpen: true },
          ),
        );
      }
      if (hit.status === "pending" || hit.status === "running" || hit.status === "blocked") {
        actions.push(
          act(
            "cancel",
            "Cancel",
            Ban,
            () =>
              attempt(
                ctx,
                () =>
                  orpc.workflows.cancelRun({
                    workspaceSlug: ws,
                    runId: hit.runId,
                  }),
                "Run cancelled",
              ),
            { destructive: true, keepOpen: true },
          ),
        );
      }
      return actions;
    }

    case "mailbox":
      return [
        go(mailPath(ws, hit.slug, "inbox")),
        go(workspaceSettingsPath(ws, "mailboxes"), "Workspace settings", Settings),
        ...(isAdmin
          ? [
              act(
                "detach",
                "Detach from this workspace",
                Unplug,
                async () => {
                  if (
                    await ctx.prompts.confirm({
                      title: `Detach ${hit.email}?`,
                      body: "It stops being part of this workspace. The mailbox keeps working everywhere else.",
                      confirm: "Detach",
                    })
                  ) {
                    await attempt(
                      ctx,
                      () =>
                        orpc.workspaceMailboxes.detach({
                          workspaceSlug: ws,
                          linkId: hit.linkId,
                        }),
                      "Detached",
                    );
                  }
                },
                { destructive: true, keepOpen: true },
              ),
            ]
          : []),
        filterBy(ctx, qualifier("mailbox", hit.slug), "Filter by this mailbox"),
      ];

    case "calendar":
      if (hit.calendarId) {
        const calendarId = hit.calendarId;
        return [
          go(calendarPath(ws, hit.slug), "Show in the calendar"),
          act("only", "Show only this one", Eye, () => {
            stashCalendarHandoff(hit.slug, { kind: "only", calendarId });
            ctx.router.push(calendarPath(ws, hit.slug));
          }),
          act("hide", "Hide", EyeOff, () => {
            stashCalendarHandoff(hit.slug, { kind: "hide", calendarId });
            ctx.router.push(calendarPath(ws, hit.slug));
          }),
          filterBy(ctx, qualifier("sub-calendar", hit.title), "Filter by this calendar"),
        ];
      }
      return [
        go(calendarPath(ws, hit.slug)),
        go(workspaceSettingsPath(ws, "calendars"), "Workspace settings", Settings),
        ...(isAdmin
          ? [
              act(
                "detach",
                "Detach from this workspace",
                Unplug,
                async () => {
                  if (
                    await ctx.prompts.confirm({
                      title: `Detach ${hit.title}?`,
                      body: "It stops being part of this workspace. The calendar keeps working everywhere else.",
                      confirm: "Detach",
                    })
                  ) {
                    await attempt(
                      ctx,
                      () =>
                        orpc.workspaceCalendars.detach({
                          workspaceSlug: ws,
                          linkId: hit.linkId,
                        }),
                      "Detached",
                    );
                  }
                },
                { destructive: true, keepOpen: true },
              ),
            ]
          : []),
        filterBy(ctx, qualifier("calendar", hit.slug), "Filter by this calendar"),
      ];

    case "drive":
      return [
        go(drivePath(ws, hit.slug)),
        go(workspaceSettingsPath(ws, "drives"), "Workspace settings", Settings),
        ...(isAdmin
          ? [
              act(
                "detach",
                "Detach from this workspace",
                Unplug,
                async () => {
                  if (
                    await ctx.prompts.confirm({
                      title: `Detach ${hit.title}?`,
                      body: "It stops being part of this workspace. The drive keeps working everywhere else.",
                      confirm: "Detach",
                    })
                  ) {
                    await attempt(
                      ctx,
                      () =>
                        orpc.workspaceDrives.detach({
                          workspaceSlug: ws,
                          linkId: hit.linkId,
                        }),
                      "Detached",
                    );
                  }
                },
                { destructive: true, keepOpen: true },
              ),
            ]
          : []),
        filterBy(ctx, qualifier("drive", hit.slug), "Filter by this drive"),
      ];

    case "addressbook":
      if (hit.bookId) {
        return [
          go(
            contactsPath(
              ws,
              hit.slug,
              packBookRef({ accountId: hit.addressBookId, bookId: hit.bookId }),
            ),
            "Show in Contacts",
          ),
          filterBy(
            ctx,
            `${qualifier("addressbook", hit.slug)} ${qualifier("book", hit.title)}`,
            "Filter by this book",
          ),
        ];
      }
      return [
        go(contactsPath(ws, hit.slug)),
        go(
          workspaceSettingsPath(
            ws,
            "contacts",
            `?addressBook=${encodeURIComponent(hit.addressBookId)}`,
          ),
          "Workspace settings",
          Settings,
        ),
        ...(isAdmin
          ? [
              act(
                "detach",
                "Detach from this workspace",
                Unplug,
                async () => {
                  if (
                    await ctx.prompts.confirm({
                      title: `Detach ${hit.title}?`,
                      body: "It stops being part of this workspace. The address book keeps working everywhere else.",
                      confirm: "Detach",
                    })
                  ) {
                    await attempt(
                      ctx,
                      () =>
                        orpc.workspaceAddressBooks.detach({
                          workspaceSlug: ws,
                          linkId: hit.linkId,
                        }),
                      "Detached",
                    );
                  }
                },
                { destructive: true, keepOpen: true },
              ),
            ]
          : []),
        filterBy(ctx, qualifier("addressbook", hit.slug), "Filter by this address book"),
      ];

    case "mail-folder":
      return [
        go(mailPath(ws, hit.mailboxSlug, hit.folder)),
        filterBy(
          ctx,
          `${qualifier("mailbox", hit.mailboxSlug)} ${qualifier("mail-folder", hit.folder)}`,
          "Filter by this folder",
        ),
      ];

    case "label": {
      const actions: SearchAction[] = [
        go(
          mailPath(
            ws,
            hit.mailboxSlug ?? ALL_MAILBOXES_SLUG,
            "inbox",
            `?label=${encodeURIComponent(hit.key)}`,
          ),
        ),
        filterBy(ctx, qualifier("label", hit.key), "Filter by this label"),
      ];
      const labelId = hit.labelId;
      const mailboxSlug = hit.mailboxSlug;
      if (hit.custom && labelId && mailboxSlug) {
        actions.push(
          act(
            "delete",
            "Delete the label",
            Trash2,
            async () => {
              if (
                await ctx.prompts.confirm({
                  title: `Delete the label ${hit.name}?`,
                  body: "Messages keep their content; the label is removed from them.",
                  confirm: "Delete label",
                })
              ) {
                await attempt(
                  ctx,
                  () =>
                    orpc.mail.customLabels.delete({
                      workspaceSlug: ws,
                      mailboxSlug,
                      id: labelId,
                    }),
                  "Label deleted",
                );
              }
            },
            { destructive: true, keepOpen: true },
          ),
        );
      }
      return actions;
    }

    case "connection":
      return [
        go("/settings/connections", "Open connections", Settings),
        ...(hit.quarantined ? [go("/settings/connections", "Reconnect", RotateCcw)] : []),
        act(
          "delete",
          "Delete the connection",
          Trash2,
          async () => {
            if (
              await ctx.prompts.confirm({
                title: `Delete ${hit.email}?`,
                body: "This removes the whole account: every mailbox, calendar, drive and address book it backs, in every workspace.",
                confirm: "Delete connection",
              })
            ) {
              await attempt(
                ctx,
                () => orpc.connections.delete({ connectionId: hit.connectionId }),
                "Connection deleted",
              );
            }
          },
          { destructive: true, keepOpen: true },
        ),
      ];

    case "subscription":
      return [
        act("open", "Open in Subscriptions", MailOpen, () =>
          ctx.router.push(mailPath(ws, hit.mailboxSlug, "subscriptions")),
        ),
        act(
          "unsubscribe",
          "Unsubscribe",
          Check,
          async () => {
            if (
              await ctx.prompts.confirm({
                title: `Unsubscribe from ${hit.senderName || hit.senderEmail}?`,
                body: "Metis asks the sender to stop. Mail already received stays where it is.",
                confirm: "Unsubscribe",
              })
            ) {
              await attempt(
                ctx,
                () =>
                  orpc.mail.subscriptions.unsubscribe({
                    workspaceSlug: ws,
                    mailboxSlug: hit.mailboxSlug,
                    items: [
                      {
                        senderEmail: hit.senderEmail,
                        messageId: hit.messageId,
                      },
                    ],
                  }),
                "Unsubscribe requested",
              );
            }
          },
          { keepOpen: true },
        ),
        filterBy(ctx, qualifier("from", hit.senderEmail), "Filter by sender"),
      ];
  }
}

export function actionsFor(ctx: ActionContext, item: SearchItem): SearchAction[] {
  switch (item.source) {
    case "mail":
      return mailActions(ctx, item.hit);
    case "event":
      return eventActions(ctx, item.hit);
    case "file":
      return fileActions(ctx, item.hit);
    case "local":
      return localActions(ctx, item.hit);
    case "client":
      return [act("run", item.entry.title, item.entry.icon, () => ctx.runClient(item.entry))];
    case "recent":
    case "saved":
      return [
        act("run", "Search", Search, () => ctx.setQuery(item.query), {
          keepOpen: true,
        }),
      ];
    case "suggestion":
    case "more":
      return [];
  }
}
