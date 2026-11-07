import "server-only";
import { addressBooksRouter } from "./address-books";
import { agentReferencesRouter } from "./agent-references";
import { aiRouter } from "./ai";
import { assistantRouter } from "./assistant";
import { auditRouter } from "./audit";
import { calendarEventsRouter } from "./calendar-events";
import { calendarsRouter } from "./calendars";
import { connectionsRouter } from "./connections";
import { contactsRouter } from "./contacts";
import { dashboardRouter } from "./dashboard";
import { driveRouter } from "./drive";
import { drivesRouter } from "./drives";
import { invitesRouter } from "./invites";
import { mailRouter } from "./mail";
import { mailboxesRouter } from "./mailboxes";
import { mcpRouter } from "./mcp";
import { searchRouter } from "./search";
import { signupRouter } from "./signup";
import { signupInvitesRouter } from "./signup-invites";
import { userRouter } from "./user";
import { workflowsRouter } from "./workflows";
import { workspaceAddressBooksRouter } from "./workspace-address-books";
import { workspaceCalendarsRouter } from "./workspace-calendars";
import { workspaceDrivesRouter } from "./workspace-drives";
import { workspaceMailboxesRouter } from "./workspace-mailboxes";
import { workspacesRouter } from "./workspaces";

export const router = {
  workspaceMailboxes: workspaceMailboxesRouter,
  workspaceCalendars: workspaceCalendarsRouter,
  workspaceDrives: workspaceDrivesRouter,
  workspaceAddressBooks: workspaceAddressBooksRouter,
  mailboxes: mailboxesRouter,
  calendars: calendarsRouter,
  calendarEvents: calendarEventsRouter,
  drive: driveRouter,
  drives: drivesRouter,
  addressBooks: addressBooksRouter,
  contacts: contactsRouter,
  connections: connectionsRouter,
  workspaces: workspacesRouter,
  workflows: workflowsRouter,
  invites: invitesRouter,
  signup: signupRouter,
  signupInvites: signupInvitesRouter,
  user: userRouter,
  mcp: mcpRouter,
  mail: mailRouter,
  ai: aiRouter,
  assistant: assistantRouter,
  agentReferences: agentReferencesRouter,
  search: searchRouter,
  audit: auditRouter,
  dashboard: dashboardRouter,
};

export type AppRouter = typeof router;
