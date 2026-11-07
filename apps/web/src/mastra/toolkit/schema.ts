import { z } from "zod";

import { THEME_BRAND_IDS } from "@/theme/brand";
import { WRITABLE_ATTENDEE_RESPONSES } from "@/types/calendar";
import { CUSTOM_LABEL_COLORS, MAIL_FOLDERS } from "@/types/mail";
import { nodeSchema } from "@/workflow/schema";

export const folderEnum = z.enum(MAIL_FOLDERS);

export const mailboxTarget = { mailboxId: z.string() };

export const messageTarget = { mailboxId: z.string(), id: z.string() };

export const listEmailsFields = {
  ...mailboxTarget,
  folder: folderEnum,
  limit: z.number().min(1).max(50).default(10),
  pageToken: z.string().optional(),
};

export const draftFields = {
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  bodyHtml: z.string(),
};

export const threadTarget = { mailboxId: z.string(), threadId: z.string() };

export const draftTarget = { mailboxId: z.string(), draftId: z.string() };

export const snoozeFields = {
  ...messageTarget,
  wakeAt: z
    .string()
    .describe("Absolute ISO-8601 time to bring the email back to the inbox; must be in the future"),
};

export const scheduleFields = {
  ...mailboxTarget,
  ...draftFields,
  scheduledFor: z.string().describe("Absolute ISO-8601 time to send it; must be in the future"),
};

export const scheduleTarget = {
  mailboxId: z.string(),
  scheduleId: z.string().describe("A scheduleId from listScheduled"),
};

export const attachmentTarget = {
  ...messageTarget,
  attachmentId: z.string().describe("An attachmentId from listAttachments"),
};

export const subscriptionScanFields = {
  ...mailboxTarget,
  scanLimit: z.number().int().min(10).max(200).default(100),
};

export const unsubscribeFields = {
  ...mailboxTarget,
  items: z
    .array(
      z.object({
        senderEmail: z.string().min(1),
        messageId: z
          .string()
          .min(1)
          .describe("The messageId listSubscriptions returned for this sender"),
      }),
    )
    .min(1)
    .max(25),
};

export const createLabelFields = {
  ...mailboxTarget,
  name: z.string().trim().min(1).max(40),
  color: z.enum(CUSTOM_LABEL_COLORS).optional(),
};

export const labelKeyTarget = {
  ...mailboxTarget,
  label: z.string().describe("A custom label key from listLabels"),
};

export const setLabelsFields = {
  ...mailboxTarget,
  ids: z.array(z.string().min(1)).min(1).max(200),
  label: z.string().min(1),
};

export const summarizeThreadFields = {
  ...messageTarget,
  threadId: z.string().optional(),
};

export const workflowTarget = {
  workflowId: z.string(),
};

const BASE_GRAPH_HINT =
  "A workflow is a graph { version: 2, nodes, edges, settings }. Call listWorkflowSteps first: it lists every step key, its settings, its outputs and what it passes on. Each node is { id, step, position: { x, y }, params, title?, skip?, onError? }; an id is a letter followed by letters, digits or _. Every setting in params is a binding: { kind: 'literal', value }, { kind: 'template', text } (text with {{ expressions }}), or { kind: 'expr', cel } (a CEL expression). Expressions read trigger (what started the run), item (what the previous step passed on), steps.<nodeId> (the result of an earlier step on the same path), now and run. Start with one or more triggers. Every step takes exactly one incoming edge except logic.merge and logic.join, whose edges each set targetHandle 'in:0', 'in:1', …; other edges omit targetHandle. An edge leaves a step through one of its outputs (sourceHandle, 'out' for most steps; logic.if has 'yes' and 'no'). A step runs once per item: list and search steps and logic.split pass on one item per entry, and logic.aggregate collects items back into one list; flow.loop runs the steps up to its flow.endLoop once per entry of a list, and flow.endLoop collects what reached it back onto the item that was looped over. Waits (flow.delay, flow.waitUntil, flow.waitFor, flow.approval) suspend the run without holding anything. A step that sends, creates or uploads (effect 'dispatch') is never repeated, and when its recipients, attendees or destination come from an AI step, a flow.approval step must come before it. onError 'branch' adds an 'error' output, 'continue' passes the item on. settings may set concurrency (most runs at once), limit ({ mode: 'debounce' | 'throttle', key: a CEL expression over trigger, seconds }) and timezone.";

const DECISION_HINT =
  "ai.ask asks the decision model questions about each item: params.questions is a literal list of { id ('q1', …), type, instructions } where type 'boolean' is yes/no, 'choice' carries options [{ id ('o1', …), name, description? }] plus other, and 'score' carries levels [{ id ('l0', …), name, description? }] lowest first; params.include lists the item fields sent to the model. Each question is an output 'q:<id>' that connects only to ai.branch steps, which route by the answer through 'yes'/'no'/'unsure', 'opt:<id>'/'other'/'unsure' or 'lvl:<id>'/'unsure'.";

export function graphHint(decisionSteps: boolean): string {
  return decisionSteps ? `${BASE_GRAPH_HINT} ${DECISION_HINT}` : BASE_GRAPH_HINT;
}

export const SOURCES_HINT =
  "Each workflow's 'sources' lists one entry per trigger that watches a mailbox, calendar or drive: triggerNodeId, the resource it watches, paused, baselined (false while the first scan is still recording what was already there, which is never acted on), lastScanAt, error, and push (whether the provider wakes it). 'endpoints' gives each webhook trigger's URL.";

export const workflowInputsField = {
  inputs: z
    .record(z.string(), z.json())
    .optional()
    .describe("Values for the inputs the workflow's Run by hand trigger declares, by input name"),
};

export const workflowRunFields = {
  workflowId: z.string().optional(),
  limit: z.number().min(1).max(100).default(25),
};

export const workflowRunDetailFields = {
  runId: z.string().min(1).describe("A run id from listWorkflowRuns"),
};

export const CANCEL_RUN_HINT =
  "Only that one run is cancelled; the workflow stays enabled and later triggers still run. A queued or retry-waiting run is cancelled at once (state 'cancelled'). A run that is executing right now is marked cancelled and stops before its next step (state 'stopping'); a step already in progress — including a send — cannot be called back and may still complete, and nothing already done at the provider is undone. A run that already finished comes back as state 'finished' with its status. Completed steps and unconfirmed outcomes stay in the run history. Relay the returned message to the user as is.";

export const RESUME_RUN_HINT =
  "Only a failed, partial or blocked run can be retried, while its step results are still kept (7 days by default), and only while its workflow is on. It re-queues that same run on the revision that originally executed: steps that completed keep their results and are never repeated (a send that went out is not sent again), and only the steps that failed or were blocked run again. It is refused — state 'refused' with the reason — when a send in the run has an unconfirmed outcome, when the workflow's owner or a mailbox lost access, or when the run is already queued, running, completed or cancelled. It is not a new run: to act on mail again from the start, use applyWorkflows. A run from before the workflow engine upgrade is history only and is always refused. Relay the returned message to the user as is.";

export const RUN_DETAIL_HINT =
  "Returns the trigger that opened it (with the event and who requested a manual run), the immutable graph revision that executed and whether the workflow has been edited since, the workflow's principal, every step in execution order with its outcome lines and per-item attempts, timings, inputs, results and sanitized errors, and the run's open waits and approvals. A Wait-for-all step also lists each input's state and item count. Items touching a mailbox, calendar or drive you can no longer see come back without their details, and addresses outside your mailboxes are masked — use listWorkflows for the live definition.";

export const listEventsFields = {
  timeMin: z.string().describe("ISO-8601 start of the window"),
  timeMax: z.string().describe("ISO-8601 end of the window"),
  calendarAccountId: z.string().optional(),
  calendarIds: z.array(z.string()).optional(),
  query: z.string().optional(),
  max: z.number().int().min(1).max(250).optional(),
};

export const eventTarget = {
  calendarAccountId: z.string().optional(),
  calendarId: z.string(),
  eventId: z.string(),
};

export const createEventFields = {
  calendarAccountId: z.string().optional(),
  calendarId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
};

export const updateEventFields = {
  ...eventTarget,
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  attendees: z.array(z.string()).optional(),
  timeZone: z.string().optional(),
};

export const respondEventFields = {
  ...eventTarget,
  response: z.enum(WRITABLE_ATTENDEE_RESPONSES),
};

export const memberMailFields = {
  memberId: z.string(),
  direction: z.enum(["from", "to", "either"]).default("either"),
  limit: z.number().int().min(1).max(50).default(15),
};

export const memberEventFields = {
  memberId: z.string(),
  timeMin: z.string().describe("ISO-8601 start of the window"),
  timeMax: z.string().describe("ISO-8601 end of the window"),
  max: z.number().int().min(1).max(100).default(50),
};

export const memberFileFields = {
  memberId: z.string(),
  query: z.string().optional().describe("Search inside the member's drives by name or content"),
  limit: z.number().int().min(1).max(100).default(25),
};

export const driveTarget = { driveId: z.string() };

export const fileTarget = {
  fileId: z
    .string()
    .describe("A fileId from listFolder, searchFiles, attached files or an <@file:…> chip"),
};

export const listFolderFields = {
  folderId: z
    .string()
    .optional()
    .describe("Omit for the top level, then pass a folder's fileId to go deeper"),
  cursor: z.string().optional(),
};

export const searchFilesFields = {
  query: z.string().min(1).max(200),
  cursor: z.string().optional(),
};

export const createFolderFields = {
  parentFolderId: z
    .string()
    .optional()
    .describe("The folder to create inside; omit for the top level"),
  name: z.string().min(1).max(255),
};

export const renameFileFields = {
  ...fileTarget,
  name: z.string().min(1).max(255),
};

export const pinFolderFields = {
  ...driveTarget,
  folderId: z.string().describe("A folder's fileId from listFolder or searchFiles"),
  label: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("The name shown on the pin; defaults to the folder's name"),
};

export const pinTarget = {
  pinId: z.string().describe("A pinId from listPins"),
};

export const previewDecisionFields = {
  ...mailboxTarget,
  node: z.object({ params: nodeSchema.shape.params }).describe("An ai.ask step's params"),
  limit: z.number().int().min(1).max(20).default(10),
};

export const memberTarget = {
  memberId: z.string().describe("A memberId from listWorkspaceMembers"),
};

export const inviteTarget = {
  inviteId: z.string().describe("An inviteId from listInvites"),
};

export const themeFields = {
  themeBrand: z.enum(THEME_BRAND_IDS),
};

export const moveFileFields = {
  ...fileTarget,
  parentFolderId: z
    .string()
    .optional()
    .describe("The folder to move it into; omit for the top level"),
};

export const addressBookTarget = {
  addressBookId: z
    .string()
    .optional()
    .describe("The address book account from listAddressBooks; optional when there is only one"),
  bookId: z
    .string()
    .describe("The book inside that account, from listAddressBooks or searchContacts"),
};

export const contactTarget = {
  ...addressBookTarget,
  contactId: z.string().describe("From searchContacts"),
};

export const contactFields = {
  name: z.string().optional().describe("Display name"),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  emails: z.array(z.string()).optional().describe("Every email address; the first is primary"),
  phones: z.array(z.string()).optional(),
  organization: z.string().optional(),
  title: z.string().optional().describe("Job title"),
  department: z.string().optional(),
  birthday: z.string().optional().describe("YYYY-MM-DD, or --MM-DD without a year"),
  address: z.string().optional().describe("One postal address on one line"),
  website: z.string().optional(),
  notes: z.string().optional(),
  groupIds: z.array(z.string()).optional().describe("Group ids from listAddressBooks"),
};

export const searchContactsFields = {
  query: z
    .string()
    .optional()
    .describe("Words to match in names, emails, phones and organizations"),
  addressBookId: z.string().optional().describe("Limit to one address book account"),
  bookId: z.string().optional().describe("Limit to one book of that account"),
  groupId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
};
