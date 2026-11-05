import "server-only";
import { z } from "zod";

import { listEventsAcross } from "@/calendar/aggregate";
import {
  attendeeResponseSchema,
  calendarSourceErrorSchema,
  workspaceRoleSchema,
} from "@/server/schema";

import {
  entrySummaryOutput,
  listDrives,
  listDrivesOutput,
  searchAcross,
  searchAcrossOutput,
} from "./drive";
import { orFailure, type Output } from "./output";
import type { WorkspaceCtx, WorkspaceMember } from "./scope";

const memberRef = z.object({ memberId: z.string(), name: z.string(), email: z.string() });

export const listMembersOutput = z.object({
  count: z.number(),
  members: z.array(memberRef.extend({ role: workspaceRoleSchema })),
});

export const findMemberMailOutput = z.object({
  member: memberRef,
  direction: z.enum(["from", "to", "either"]),
  count: z.number(),
  emails: z.array(
    z.object({
      mailboxId: z.string(),
      mailbox: z.string(),
      id: z.string(),
      from: z.string(),
      fromName: z.string().optional(),
      to: z.array(z.string()),
      subject: z.string(),
      date: z.string(),
      isRead: z.boolean(),
      snippet: z.string(),
    }),
  ),
});

export const findMemberFilesOutput = z.union([
  z.object({ member: memberRef, drives: z.array(z.never()), note: z.string() }),
  listDrivesOutput.extend({ member: memberRef }),
  z.object({
    member: memberRef,
    drives: listDrivesOutput.shape.drives,
    query: z.string(),
    count: z.number(),
    entries: z.array(entrySummaryOutput),
    errors: searchAcrossOutput.shape.errors,
  }),
]);

export const findMemberEventsOutput = orFailure(
  z.object({
    member: memberRef,
    window: z.object({ timeMin: z.string(), timeMax: z.string() }),
    count: z.number(),
    events: z.array(
      z.object({
        eventId: z.string(),
        calendarAccountId: z.string().optional(),
        calendarId: z.string(),
        calendarName: z.string().optional(),
        title: z.string(),
        start: z.string(),
        end: z.string(),
        allDay: z.boolean(),
        response: attendeeResponseSchema.optional(),
        organizer: z.boolean(),
      }),
    ),
    errors: z.array(calendarSourceErrorSchema).optional(),
  }),
);

export type MailDirection = "from" | "to" | "either";

function addressed(addresses: string[] | undefined, email: string): boolean {
  const needle = email.toLowerCase();
  return (addresses ?? []).some((a) => a.toLowerCase().includes(needle));
}

export async function listMembers(ctx: WorkspaceCtx): Promise<Output<typeof listMembersOutput>> {
  const members = await ctx.members();
  return {
    count: members.length,
    members: members.map((m) => ({
      memberId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
    })),
  };
}

export async function findMemberMail(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { direction: MailDirection; limit: number },
): Promise<Output<typeof findMemberMailOutput>> {
  const address = member.email;

  const groups = await Promise.all(
    ctx.mailboxes.map(async (m) => {
      try {
        const { emails } = await m.adapter.search(address);
        return emails.map((e) => ({
          mailboxId: m.mailboxId,
          mailbox: m.email,
          id: e.id,
          from: e.from,
          fromName: e.fromName,
          to: e.to,
          cc: e.cc,
          subject: e.subject,
          date: e.date,
          isRead: e.isRead,
          snippet: e.snippet.slice(0, 120),
        }));
      } catch {
        return [];
      }
    }),
  );

  const matched = groups
    .flat()
    .filter((e) => {
      const sent = e.from.toLowerCase().includes(address.toLowerCase());
      const received = addressed(e.to, address) || addressed(e.cc, address);
      if (args.direction === "from") return sent;
      if (args.direction === "to") return received;
      return sent || received;
    })
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, args.limit);

  return {
    member: { memberId: member.userId, name: member.name, email: address },
    direction: args.direction,
    count: matched.length,
    emails: matched.map(({ cc: _cc, ...rest }) => rest),
  };
}

export async function findMemberFiles(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { query?: string; limit: number },
): Promise<Output<typeof findMemberFilesOutput>> {
  const drives = ctx.drives.filter((d) => d.ownerUserId === member.userId);
  const who = {
    memberId: member.userId,
    name: member.name,
    email: member.email,
  };
  if (drives.length === 0) {
    return {
      member: who,
      drives: [],
      note: "This member has connected no drive that this workspace can see.",
    };
  }

  const listed = listDrives(drives);
  if (!args.query) return { member: who, ...listed };

  const found = await searchAcross(drives, args.query);
  return {
    member: who,
    drives: listed.drives,
    query: args.query,
    count: Math.min(found.count, args.limit),
    entries: found.entries.slice(0, args.limit),
    errors: found.errors,
  };
}

export async function findMemberEvents(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { timeMin: string; timeMax: string; max: number },
): Promise<Output<typeof findMemberEventsOutput>> {
  if (ctx.calendars.length === 0) {
    return { error: "No calendar is connected to this workspace" };
  }
  const address = member.email.toLowerCase();

  const { events, calendarErrors } = await listEventsAcross(ctx.calendars, {
    timeMin: args.timeMin,
    timeMax: args.timeMax,
    max: args.max,
  });

  const involved = events.filter(
    (e) =>
      e.organizer?.email.toLowerCase() === address ||
      (e.attendees ?? []).some((a) => a.email.toLowerCase() === address),
  );

  return {
    member: { memberId: member.userId, name: member.name, email: member.email },
    window: { timeMin: args.timeMin, timeMax: args.timeMax },
    count: involved.length,
    events: involved.map((e) => ({
      eventId: e.id,
      calendarAccountId: e.accountId,
      calendarId: e.calendarId,
      calendarName: e.calendarName,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      response: (e.attendees ?? []).find((a) => a.email.toLowerCase() === address)?.response,
      organizer: e.organizer?.email.toLowerCase() === address,
    })),
    errors: calendarErrors?.length ? calendarErrors : undefined,
  };
}
