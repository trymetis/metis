import "server-only";
import type { WorkspaceUserSession } from "@/auth/session";
import { listCalendarsAcross } from "@/calendar/aggregate";
import { cachedCalendarList } from "@/calendar/list-cache";
import { workspaceCalendarAccounts } from "@/calendar/session";
import {
  listWorkspaceAddressBooks,
  listWorkspaceCalendars,
  listWorkspaceConnectionsOf,
  listWorkspaceDrives,
  listWorkspaceMailboxes,
} from "@/connections";
import { ADDRESS_BOOK_PROVIDER_LABELS, addressBookName } from "@/connections/address-book-name";
import { CALENDAR_PROVIDER_LABELS, calendarName } from "@/connections/calendar-name";
import { savedContactIndex, workspaceBookList } from "@/contacts/lookup";
import { DRIVE_PROVIDER_LABELS, driveName } from "@/drive/name";
import { listCustomLabels } from "@/mail/custom-labels";
import { LABEL_OPTIONS } from "@/mail/label-meta";
import { mailSessionFor } from "@/mail/session";
import { scanSubscriptions } from "@/mail/subscriptions";
import { assistantThreadTexts, assistantThreadTitle, listAssistantThreads } from "@/mastra/memory";
import { suggestPeople } from "@/people";
import type { LocalSearchHit } from "@/server/schema";
import { MAIL_FOLDERS } from "@/types/mail";
import { listWorkspaceRuns, listWorkspaceWorkflows } from "@/workflow";
import { workflowScopeFor } from "@/workflow/scope";
import { listWorkspaceMembers } from "@/workspace";
import { listWorkspaceInvites } from "@/workspace/admin";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";

import { type ParserAst, tagKey, tags } from "./ast";
import type { SearchKind } from "./fields";
import { pruneFor } from "./kinds";
import { matcherFor, type SearchDoc } from "./match";

const MAX_CHAT_TEXT_THREADS = 40;
const MAX_RUNS = 50;
const SUBSCRIPTION_SCAN = 50;

export interface LocalSearchContext {
  appUser: WorkspaceUserSession;
  ast: ParserAst;
  timeZone: string;
}

type Hit = LocalSearchHit;

interface Candidate {
  hit: Hit;
  doc: SearchDoc;
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function ms(value: Date | string | null | undefined): number {
  const at = iso(value);
  return at ? new Date(at).getTime() : 0;
}

function folderTitle(folder: string): string {
  return folder.charAt(0).toUpperCase() + folder.slice(1);
}

function hasFreeText(ast: ParserAst | null): boolean {
  return ast !== null && tags(ast).some((tag) => tagKey(tag) === null);
}

async function chats(ctx: LocalSearchContext, ast: ParserAst | null) {
  const threads = await listAssistantThreads({
    userId: ctx.appUser.userId,
    workspaceId: ctx.appUser.workspaceId,
  });
  const recent = threads.toSorted((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  const texts = hasFreeText(ast)
    ? await assistantThreadTexts(
        ctx.appUser.userId,
        recent.slice(0, MAX_CHAT_TEXT_THREADS).map((t) => t.id),
      )
    : new Map<string, string>();
  return recent.map((thread): Candidate => {
    const title = assistantThreadTitle(thread);
    return {
      hit: {
        kind: "chat",
        id: thread.id,
        threadId: thread.id,
        title,
        date: iso(thread.updatedAt),
      },
      doc: {
        type: "chat",
        title,
        text: [title, texts.get(thread.id) ?? ""],
        date: ms(thread.updatedAt),
      },
    };
  });
}

async function members(ctx: LocalSearchContext) {
  const [rows, invites] = await Promise.all([
    listWorkspaceMembers(ctx.appUser.workspaceId),
    listWorkspaceInvites({
      workspaceId: ctx.appUser.workspaceId,
      actorRole: ctx.appUser.workspaceRole,
    }),
  ]);
  const people = rows.map((m): Candidate => ({
    hit: {
      kind: "member",
      id: `member:${m.userId}`,
      title: m.name || m.email,
      subtitle: m.email,
      date: iso(m.joinedAt),
      memberId: m.memberId,
      userId: m.userId,
      email: m.email,
      name: m.name,
      image: m.image,
      role: m.role,
      invited: false,
      inviteId: null,
      joinedAt: iso(m.joinedAt) ?? null,
      expiresAt: null,
    },
    doc: {
      type: "member",
      text: [m.name, m.email],
      name: m.name,
      email: m.email,
      role: m.role,
      is: [],
      date: ms(m.joinedAt),
    },
  }));
  const pending = "error" in invites ? [] : invites;
  return [
    ...people,
    ...pending.map((i): Candidate => ({
      hit: {
        kind: "member",
        id: `invite:${i.id}`,
        title: i.email,
        subtitle: "Invited",
        date: iso(i.createdAt),
        memberId: null,
        userId: null,
        email: i.email,
        name: "",
        image: null,
        role: i.role,
        invited: true,
        inviteId: i.id,
        joinedAt: null,
        expiresAt: iso(i.expiresAt) ?? null,
      },
      doc: {
        type: "member",
        text: [i.email],
        name: "",
        email: i.email,
        role: i.role,
        is: ["invited"],
        date: ms(i.createdAt),
      },
    })),
  ];
}

async function contacts(ctx: LocalSearchContext) {
  const { workspaceId } = ctx.appUser;
  const mail = await mailSessionFor(ctx.appUser, ALL_MAILBOXES_SLUG);
  const [entries, books, people] = await Promise.all([
    savedContactIndex(workspaceId).catch((err: unknown) => {
      console.warn("[search] saved contacts unavailable", err);
      return [];
    }),
    listWorkspaceAddressBooks(workspaceId),
    suggestPeople({
      userId: ctx.appUser.userId,
      workspaceId,
      mailboxIds: mail?.mailboxes.map((m) => m.mailboxId) ?? [],
      adapter: mail?.adapter ?? null,
    }),
  ]);
  const accountEmail = new Map(books.map((b) => [b.slug, b.email]));
  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.accountId}:${entry.bookId}:${entry.contactId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  const saved = [...grouped.entries()].flatMap(([key, rows]): Candidate[] => {
    const [first] = rows;
    if (!first) return [];
    const emails = rows.map((r) => r.email).filter(Boolean);
    const email = emails[0] ?? "";
    const name = first.name || email;
    const phone = first.phones[0];
    return [
      {
        hit: {
          kind: "contact",
          id: `contact:${key}`,
          title: name || phone || first.organization || "Unnamed",
          subtitle: email || phone || first.organization || first.bookName || undefined,
          email,
          ...(first.name ? { name: first.name } : {}),
          ...(phone ? { phone } : {}),
          ...(first.organization ? { organization: first.organization } : {}),
          ...(first.bookName ? { bookName: first.bookName } : {}),
          saved: {
            addressBookSlug: first.addressBookSlug,
            accountId: first.accountId,
            bookId: first.bookId,
            contactId: first.contactId,
          },
        },
        doc: {
          type: "contact",
          text: [
            first.name,
            ...emails,
            ...first.phones,
            first.organization ?? "",
            first.title ?? "",
          ],
          name: first.name,
          email: emails,
          phone: first.phones,
          organization: first.organization ?? "",
          title: first.title ?? "",
          addressbook: [first.addressBookSlug, accountEmail.get(first.addressBookSlug) ?? ""],
          book: first.bookName,
        },
      },
    ];
  });
  const history = people
    .filter((c) => !c.saved)
    .map((c): Candidate => ({
      hit: {
        kind: "contact",
        id: `contact:${c.email}`,
        title: c.name || c.email,
        subtitle: c.name ? c.email : undefined,
        email: c.email,
        name: c.name,
      },
      doc: {
        type: "contact",
        text: [c.name ?? "", c.email],
        name: c.name ?? "",
        email: c.email,
      },
    }));
  return [...saved, ...history];
}

async function workflows(ctx: LocalSearchContext) {
  const scope = await workflowScopeFor(ctx.appUser);
  const rows = await listWorkspaceWorkflows(scope);
  return rows.map((w): Candidate => ({
    hit: {
      kind: "workflow",
      id: `workflow:${w.id}`,
      title: w.name,
      subtitle: w.enabled ? "On" : "Off",
      date: iso(w.updatedAt),
      workflowId: w.id,
      enabled: w.enabled,
    },
    doc: {
      type: "workflow",
      text: [w.name],
      name: w.name,
      is: [w.enabled ? "enabled" : "disabled"],
      date: ms(w.updatedAt),
    },
  }));
}

async function runs(ctx: LocalSearchContext) {
  const scope = await workflowScopeFor(ctx.appUser);
  const rows = await listWorkspaceRuns({ scope, limit: MAX_RUNS });
  return rows.map((r): Candidate => ({
    hit: {
      kind: "run",
      id: `run:${r.id}`,
      title: r.workflowName,
      subtitle: r.status,
      date: r.startedAt ?? r.dueAt,
      runId: r.id,
      workflowId: r.workflowId,
      workflowName: r.workflowName,
      status: r.status,
      error: r.error,
    },
    doc: {
      type: "run",
      text: [r.workflowName, r.error ?? ""],
      workflow: r.workflowName,
      status: r.status,
      date: ms(r.startedAt ?? r.dueAt),
    },
  }));
}

async function mailboxes(ctx: LocalSearchContext) {
  const rows = await listWorkspaceMailboxes(ctx.appUser.workspaceId);
  return rows.map((m): Candidate => ({
    hit: {
      kind: "mailbox",
      id: `mailbox:${m.id}`,
      title: m.email,
      subtitle: m.provider,
      mailboxId: m.id,
      linkId: m.linkId,
      slug: m.slug,
      email: m.email,
      provider: m.provider,
      ai: m.policy.ai,
    },
    doc: {
      type: "mailbox",
      text: [m.email, m.slug],
      name: [m.email, m.slug],
      provider: m.provider,
      mailbox: [m.slug, m.email],
    },
  }));
}

async function subCalendars(ctx: LocalSearchContext) {
  const accounts = await workspaceCalendarAccounts(ctx.appUser.workspaceId);
  const field = `${ctx.appUser.userId}:${accounts.map((a) => a.accountId).join(",")}`;
  return cachedCalendarList(ctx.appUser.workspaceId, field, () => listCalendarsAcross(accounts));
}

async function calendars(ctx: LocalSearchContext) {
  const [rows, nested] = await Promise.all([
    listWorkspaceCalendars(ctx.appUser.workspaceId),
    subCalendars(ctx),
  ]);
  const accounts = rows.map((c): Candidate => ({
    hit: {
      kind: "calendar",
      id: `calendar:${c.id}`,
      title: calendarName(c, rows),
      subtitle: CALENDAR_PROVIDER_LABELS[c.provider],
      accountId: c.id,
      linkId: c.linkId,
      slug: c.slug,
      email: c.email,
      provider: c.provider,
      ai: c.policy.ai,
      calendarId: null,
      color: null,
    },
    doc: {
      type: "calendar",
      text: [calendarName(c, rows), c.email, c.slug],
      name: [calendarName(c, rows), c.email, c.slug],
      provider: c.provider,
      calendar: [c.slug, c.email],
    },
  }));
  const bySlug = new Map(rows.map((c) => [c.id, c]));
  const inner = nested.calendars.flatMap((cal): Candidate[] => {
    const account = bySlug.get(cal.accountId);
    if (!account || !cal.visible) return [];
    return [
      {
        hit: {
          kind: "calendar",
          id: `sub-calendar:${cal.accountId}:${cal.id}`,
          title: cal.name,
          subtitle: calendarName(account, rows),
          accountId: cal.accountId,
          linkId: account.linkId,
          slug: account.slug,
          email: cal.accountEmail,
          provider: cal.provider,
          ai: account.policy.ai,
          calendarId: cal.id,
          color: cal.color ?? null,
        },
        doc: {
          type: "calendar",
          text: [cal.name, calendarName(account, rows), cal.accountEmail],
          name: cal.name,
          "sub-calendar": cal.name,
          provider: cal.provider,
          calendar: [account.slug, account.email],
        },
      },
    ];
  });
  return [...accounts, ...inner];
}

async function drives(ctx: LocalSearchContext) {
  const rows = await listWorkspaceDrives(ctx.appUser.workspaceId);
  return rows.map((d): Candidate => ({
    hit: {
      kind: "drive",
      id: `drive:${d.id}`,
      title: driveName(d, rows),
      subtitle: DRIVE_PROVIDER_LABELS[d.provider],
      driveId: d.id,
      linkId: d.linkId,
      slug: d.slug,
      email: d.email,
      provider: d.provider,
      server: d.server,
      ai: d.policy.ai,
    },
    doc: {
      type: "drive",
      text: [driveName(d, rows), d.email, d.slug],
      name: [driveName(d, rows), d.email, d.slug],
      provider: d.provider,
      drive: [d.slug, d.email],
    },
  }));
}

async function addressBooks(ctx: LocalSearchContext) {
  const { workspaceId } = ctx.appUser;
  const [rows, list] = await Promise.all([
    listWorkspaceAddressBooks(workspaceId),
    workspaceBookList(workspaceId).catch((err: unknown) => {
      console.warn("[search] address book lists unavailable", err);
      return { books: [], groups: [], errors: [] };
    }),
  ]);
  const accounts = rows.map((b): Candidate => ({
    hit: {
      kind: "addressbook",
      id: `addressbook:${b.id}`,
      title: addressBookName(b, rows),
      subtitle: ADDRESS_BOOK_PROVIDER_LABELS[b.provider],
      addressBookId: b.id,
      linkId: b.linkId,
      slug: b.slug,
      email: b.email,
      provider: b.provider,
      server: b.server,
      ai: b.policy.ai,
      bookId: null,
    },
    doc: {
      type: "addressbook",
      text: [addressBookName(b, rows), b.email, b.slug],
      name: [addressBookName(b, rows), b.email, b.slug],
      provider: b.provider,
      addressbook: [b.slug, b.email],
    },
  }));
  const byId = new Map(rows.map((b) => [b.id, b]));
  const inner = list.books.flatMap((book): Candidate[] => {
    const account = byId.get(book.accountId);
    if (!account || !book.visible) return [];
    return [
      {
        hit: {
          kind: "addressbook",
          id: `book:${book.accountId}:${book.id}`,
          title: book.name,
          subtitle: addressBookName(account, rows),
          addressBookId: account.id,
          linkId: account.linkId,
          slug: account.slug,
          email: account.email,
          provider: account.provider,
          server: account.server,
          ai: account.policy.ai,
          bookId: book.id,
        },
        doc: {
          type: "addressbook",
          text: [book.name, addressBookName(account, rows), account.email],
          name: book.name,
          book: book.name,
          provider: account.provider,
          addressbook: [account.slug, account.email],
        },
      },
    ];
  });
  return [...accounts, ...inner];
}

async function mailFolders(ctx: LocalSearchContext) {
  const rows = await listWorkspaceMailboxes(ctx.appUser.workspaceId);
  return rows.flatMap((m) =>
    MAIL_FOLDERS.map((folder): Candidate => ({
      hit: {
        kind: "mail-folder",
        id: `mail-folder:${m.id}:${folder}`,
        title: folderTitle(folder),
        subtitle: m.email,
        folder,
        mailboxSlug: m.slug,
        mailboxEmail: m.email,
      },
      doc: {
        type: "mail-folder",
        text: [folder, m.email],
        name: folder,
        mailbox: [m.slug, m.email],
      },
    })),
  );
}

async function labels(ctx: LocalSearchContext) {
  const rows = await listWorkspaceMailboxes(ctx.appUser.workspaceId);
  const builtIn = LABEL_OPTIONS.map((l): Candidate => ({
    hit: {
      kind: "label",
      id: `label:${l.key}`,
      title: l.name,
      subtitle: "Every mailbox",
      key: l.key,
      name: l.name,
      color: null,
      custom: false,
      labelId: null,
      mailboxSlug: null,
    },
    doc: {
      type: "label",
      text: [l.name, l.key],
      name: [l.name, l.key],
      mailbox: [],
    },
  }));
  const custom = await Promise.all(
    rows.map(async (m) =>
      (await listCustomLabels([m.id])).map((l): Candidate => ({
        hit: {
          kind: "label",
          id: `label:${m.id}:${l.key}`,
          title: l.name,
          subtitle: m.email,
          key: l.key,
          name: l.name,
          color: l.color,
          custom: true,
          labelId: l.id,
          mailboxSlug: m.slug,
        },
        doc: {
          type: "label",
          text: [l.name, l.key],
          name: [l.name, l.key],
          mailbox: [m.slug, m.email],
        },
      })),
    ),
  );
  return [...builtIn, ...custom.flat()];
}

async function connections(ctx: LocalSearchContext) {
  const rows = await listWorkspaceConnectionsOf(ctx.appUser.userId, ctx.appUser.workspaceId);
  return rows.map((c): Candidate => ({
    hit: {
      kind: "connection",
      id: `connection:${c.connectionId}`,
      title: c.email,
      subtitle: c.server ?? c.provider,
      connectionId: c.connectionId,
      provider: c.provider,
      email: c.email,
      server: c.server,
      quarantined: c.quarantined,
      resources: c.resources,
    },
    doc: {
      type: "connection",
      text: [c.email, c.provider, c.server ?? ""],
      email: c.email,
      provider: c.provider,
      is: c.quarantined ? ["quarantined"] : [],
    },
  }));
}

async function subscriptions(ctx: LocalSearchContext) {
  const rows = await listWorkspaceMailboxes(ctx.appUser.workspaceId);
  const out: Candidate[] = [];
  const scans = await Promise.all(
    rows.map(async (row) => {
      const mail = await mailSessionFor(ctx.appUser, row.slug);
      if (!mail) return null;
      const { senders } = await scanSubscriptions(mail, SUBSCRIPTION_SCAN);
      return { row, senders };
    }),
  );
  for (const scan of scans) {
    if (!scan) continue;
    const { row, senders } = scan;
    for (const s of senders) {
      out.push({
        hit: {
          kind: "subscription",
          id: `subscription:${row.id}:${s.senderEmail}`,
          title: s.senderName || s.senderEmail,
          subtitle: `${s.count} in ${row.email}`,
          date: iso(s.latestDate),
          mailboxSlug: row.slug,
          mailboxEmail: row.email,
          senderEmail: s.senderEmail,
          senderName: s.senderName,
          messageId: s.messageId,
          count: s.count,
          latestDate: s.latestDate,
          latestSubject: s.latestSubject,
          methods: s.methods,
          unsubscribedStatus: s.unsubscribedStatus,
        },
        doc: {
          type: "subscription",
          text: [s.senderName ?? "", s.senderEmail, s.latestSubject],
          from: [s.senderName ?? "", s.senderEmail],
          name: s.senderName ?? s.senderEmail,
          date: ms(s.latestDate),
        },
      });
    }
  }
  return out;
}

type Loader = (ctx: LocalSearchContext, ast: ParserAst | null) => Promise<Candidate[]>;

const LOADERS: Partial<Record<SearchKind, Loader>> = {
  chat: chats,
  member: members,
  contact: contacts,
  workflow: workflows,
  run: runs,
  mailbox: mailboxes,
  calendar: calendars,
  drive: drives,
  addressbook: addressBooks,
  "mail-folder": mailFolders,
  label: labels,
  connection: connections,
  subscription: subscriptions,
};

export const LOCAL_LIMIT = 8;

export async function searchLocal(
  ctx: LocalSearchContext,
  kinds: readonly SearchKind[],
): Promise<{ hits: Hit[]; errors: string[] }> {
  const errors: string[] = [];
  const groups = await Promise.all(
    kinds.map(async (kind) => {
      const load = LOADERS[kind];
      if (!load) return [];
      const pruned = pruneFor(ctx.ast, kind);
      if (pruned === false) return [];
      const ast = pruned === true ? null : pruned;
      try {
        const candidates = await load(ctx, ast);
        const matcher = matcherFor(ast, ctx.timeZone);
        return candidates
          .filter((c) => matcher.matches(c.doc))
          .slice(0, kind === "calendar" || kind === "addressbook" ? LOCAL_LIMIT * 2 : LOCAL_LIMIT)
          .map((c) => c.hit);
      } catch (err) {
        console.error(`[search] ${kind} failed:`, err);
        errors.push(kind);
        return [];
      }
    }),
  );
  return { hits: groups.flat(), errors };
}
