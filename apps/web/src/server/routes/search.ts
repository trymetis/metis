import "server-only";
import { ORPCError } from "@orpc/server";

import type { WorkspaceUserSession } from "@/auth/session";
import { accountNameIn, listCalendarsAcross } from "@/calendar/aggregate";
import { searchEvents } from "@/calendar/search";
import { workspaceCalendarAccounts } from "@/calendar/session";
import { listWorkspaceCalendars, listWorkspaceDrives, listWorkspaceMailboxes } from "@/connections";
import { DRIVE_PROVIDER_LABELS, driveName } from "@/drive/name";
import { searchFiles } from "@/drive/search";
import { workspaceDrives } from "@/drive/session";
import { suggestContacts } from "@/mail/contacts";
import { listCustomLabels } from "@/mail/custom-labels";
import { LABEL_OPTIONS } from "@/mail/label-meta";
import { searchMail } from "@/mail/search";
import { mailSessionFor } from "@/mail/session";
import type { ParserAst } from "@/search/ast";
import { isValidTimeZone } from "@/search/dates";
import { REMOTE_KINDS, type SearchKind } from "@/search/fields";
import { pruneFor, serverKinds } from "@/search/kinds";
import { isEmptySearch, parseSearch, type SearchDiagnostic } from "@/search/query";
import { createSavedSearch, deleteSavedSearch, listSavedSearches } from "@/search/saved";
import { searchLocal } from "@/search/sources";
import { enforceRateLimit } from "@/services/rate-limit";
import { listWorkspaceWorkflows } from "@/workflow";
import { workflowScopeFor } from "@/workflow/scope";
import { listWorkspaceMembers } from "@/workspace";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  createSavedSearchInputSchema,
  createSavedSearchOutputSchema,
  deleteSavedSearchInputSchema,
  listSavedSearchesOutputSchema,
  okSchema,
  type SearchSuggestion,
  searchEventsOutputSchema,
  searchFilesOutputSchema,
  searchInputSchema,
  searchLocalOutputSchema,
  searchMailOutputSchema,
  searchSuggestInputSchema,
  searchSuggestOutputSchema,
  workspaceScopeSchema,
} from "../schema";

const SEARCH_RATE = { scope: "search", limit: 240, windowSec: 60 };
const SUGGEST_RATE = { scope: "search-suggest", limit: 240, windowSec: 60 };
const SUGGEST_LIMIT = 8;

interface Prepared {
  ast: ParserAst | null;
  diagnostics: SearchDiagnostic[];
  timeZone: string;
}

async function prepare(
  appUser: WorkspaceUserSession,
  input: { q: string; timeZone?: string },
): Promise<Prepared> {
  await enforceRateLimit(appUser.userId, SEARCH_RATE, "Too many searches. Please wait a moment.");
  const timeZone = input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : "UTC";
  const parsed = parseSearch(input.q.trim(), timeZone);
  if (!parsed.ok) {
    return { ast: null, diagnostics: parsed.diagnostics, timeZone };
  }
  if (parsed.diagnostics.length > 0 || isEmptySearch(parsed.ast)) {
    return { ast: null, diagnostics: parsed.diagnostics, timeZone };
  }
  return { ast: parsed.ast, diagnostics: [], timeZone };
}

function pruned(ast: ParserAst | null, kind: SearchKind) {
  return ast ? pruneFor(ast, kind) : false;
}

function contains(prefix: string, ...values: (string | null | undefined)[]) {
  const needle = prefix.toLowerCase();
  return values.some((v) => (v ?? "").toLowerCase().includes(needle));
}

async function suggest(
  appUser: WorkspaceUserSession,
  key: string,
  prefix: string,
): Promise<SearchSuggestion[]> {
  const { userId, workspaceId } = appUser;
  switch (key) {
    case "mailbox":
      return (await listWorkspaceMailboxes(workspaceId))
        .filter((m) => contains(prefix, m.slug, m.email))
        .map((m) => ({ value: m.slug, label: m.email, detail: m.provider }));
    case "calendar":
      return (await listWorkspaceCalendars(workspaceId))
        .filter((c) => contains(prefix, c.slug, c.email))
        .map((c) => ({ value: c.slug, label: c.email, detail: c.provider }));
    case "drive": {
      const drives = await listWorkspaceDrives(workspaceId);
      return drives
        .filter((d) => contains(prefix, d.slug, d.email, d.server))
        .map((d) => ({
          value: d.slug,
          label: driveName(d, drives),
          detail: DRIVE_PROVIDER_LABELS[d.provider],
        }));
    }
    case "sub-calendar": {
      const accounts = await workspaceCalendarAccounts(workspaceId);
      const { calendars } = await listCalendarsAcross(accounts);
      return calendars
        .filter((c) => c.visible && contains(prefix, c.name))
        .map((c) => ({ value: c.name, label: c.name, detail: c.accountEmail }));
    }
    case "label": {
      const boxes = await listWorkspaceMailboxes(workspaceId);
      const custom = await listCustomLabels(boxes.map((b) => b.id));
      return [...LABEL_OPTIONS, ...custom]
        .filter((l) => contains(prefix, l.key, l.name))
        .map((l) => ({ value: l.key, label: l.name }));
    }
    case "workflow": {
      const scope = await workflowScopeFor(appUser);
      return (await listWorkspaceWorkflows(scope))
        .filter((w) => contains(prefix, w.name))
        .map((w) => ({ value: w.name, label: w.name }));
    }
    case "from":
    case "to":
    case "cc":
    case "attendee":
    case "organizer":
    case "email": {
      const members = await listWorkspaceMembers(workspaceId);
      const people = members.map((m) => ({ email: m.email, name: m.name }));
      const mail = await mailSessionFor(appUser, ALL_MAILBOXES_SLUG);
      const contacts = mail
        ? await suggestContacts({
            userId,
            mailboxIds: mail.mailboxes.map((m) => m.mailboxId),
            adapter: mail.adapter,
          }).catch(() => [])
        : [];
      const seen = new Set<string>();
      return [...people, ...contacts]
        .filter((p) => {
          const email = p.email.toLowerCase();
          if (seen.has(email)) return false;
          seen.add(email);
          return contains(prefix, p.email, p.name);
        })
        .map((p) => ({
          value: p.email,
          label: p.name || p.email,
          detail: p.name ? p.email : undefined,
        }));
    }
    default:
      return [];
  }
}

export const searchRouter = {
  mail: workspaceSession(searchInputSchema)
    .output(searchMailOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const { ast, diagnostics, timeZone } = await prepare(appUser, input);
      const query = pruned(ast, "mail");
      if (query === false) return { emails: [], diagnostics };
      const mail = await mailSessionFor(appUser, ALL_MAILBOXES_SLUG);
      if (!mail) return { emails: [], diagnostics };
      const result = await searchMail(mail, query, {
        cursor: input.cursor,
        timeZone,
      });
      return { ...result, diagnostics };
    }),

  events: workspaceSession(searchInputSchema)
    .output(searchEventsOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const { ast, diagnostics, timeZone } = await prepare(appUser, input);
      const query = pruned(ast, "event");
      if (query === false) return { events: [], diagnostics };
      const accounts = await workspaceCalendarAccounts(appUser.workspaceId);
      const result = await searchEvents(accounts, query, { timeZone });
      return {
        ...result,
        events: result.events.map((event) => ({
          ...event,
          accountName: accountNameIn(accounts, event.accountId, event.accountEmail ?? ""),
        })),
        calendarErrors: result.calendarErrors?.map((error) => ({
          ...error,
          accountName: accountNameIn(accounts, error.accountId, error.accountEmail),
        })),
        diagnostics,
      };
    }),

  files: workspaceSession(searchInputSchema)
    .output(searchFilesOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const { ast, diagnostics, timeZone } = await prepare(appUser, input);
      const query = pruned(ast, "file");
      if (query === false) return { entries: [], cursor: null, diagnostics };
      const drives = await workspaceDrives(appUser.userId, appUser.workspaceId);
      const result = await searchFiles(appUser.userId, drives, query, {
        cursor: input.cursor,
        timeZone,
      });
      return { ...result, diagnostics };
    }),

  local: workspaceSession(searchInputSchema)
    .output(searchLocalOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const { ast, diagnostics, timeZone } = await prepare(appUser, input);
      if (!ast) return { hits: [], errors: [], diagnostics };
      const remote: readonly SearchKind[] = REMOTE_KINDS;
      const kinds = serverKinds(ast).filter((k) => !remote.includes(k));
      const { hits, errors } = await searchLocal({ appUser, ast, timeZone }, kinds);
      return { hits, errors, diagnostics };
    }),

  suggest: workspaceSession(searchSuggestInputSchema)
    .output(searchSuggestOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      await enforceRateLimit(
        appUser.userId,
        SUGGEST_RATE,
        "Too many suggestions. Please wait a moment.",
      );
      const values = await suggest(appUser, input.key.toLowerCase(), input.prefix);
      return { values: values.slice(0, SUGGEST_LIMIT) };
    }),

  saved: {
    list: workspaceSession(workspaceScopeSchema)
      .output(listSavedSearchesOutputSchema)
      .handler(async ({ context }) => ({
        searches: await listSavedSearches(context.appUser),
      })),

    create: workspaceSession(createSavedSearchInputSchema)
      .output(createSavedSearchOutputSchema)
      .handler(async ({ input, context }) => {
        const created = await createSavedSearch(context.appUser, {
          name: input.name,
          query: input.query,
        });
        if (created === "full") {
          throw new ORPCError("CONFLICT", {
            message: "You have saved as many searches as this workspace allows",
          });
        }
        return { search: created };
      }),

    delete: workspaceSession(deleteSavedSearchInputSchema)
      .output(okSchema)
      .handler(async ({ input, context }) => {
        const removed = await deleteSavedSearch(context.appUser, input.id);
        if (!removed) {
          throw new ORPCError("NOT_FOUND", {
            message: "Saved search not found",
          });
        }
        return { ok: true as const };
      }),
  },
};
