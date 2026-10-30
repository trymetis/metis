import { APPROVED_FOLDER, SUBJECTS } from "./cast";

export const INBOX_PAGE_SIZE = 100;
export const CLASSIFY_BATCH_SIZE = 25;
export const VIEWER_TIME_ZONE = "UTC";
export const GATED_SUBJECTS = ["jsonld-50-blocks", "jsonld-hostile-urls"] as const;

export const MAIL_CHAT = {
  folder: "inbox",
  attachedSubject: SUBJECTS.kickoff,
  turns: [
    "Summarize this email and tell me what I need to do next.",
    "Who sent it, and who else is on the thread?",
    "Is there a deadline mentioned anywhere in it?",
    "Find any other emails in my inbox about the rebrand.",
    "Is there a calendar invite for the rebrand review in my inbox?",
    "What time is that review, in UTC?",
    "Draft me a short reply to the kickoff email, but do not send it. Just show me the text.",
    "Make that reply a bit more formal.",
    "Now show me the shipping notification for order A-42.",
    "Which carrier is it shipping with, and is there a tracking link?",
    "Did I get a bank alert recently? What was the amount?",
    "Which account was it debited from?",
    "Is there a Codeyard verification code email? Tell me what it is for without repeating the code.",
    "Of everything we looked at, what is the single most urgent thing?",
    "Give me a three-line recap of this whole conversation.",
  ],
} as const;

export const CALENDAR_CHAT = {
  view: "week",
  date: "2026-10-08T12:00:00.000Z",
  turns: [
    "What meetings do I have on Thursday, October 8, 2026?",
    "Which calendars do I have connected?",
    "What is on my work calendar this week?",
    "How often does the daily standup happen, and at what time?",
    "When is the first standup in October?",
    "Is the design review a one-off or recurring?",
    "Who is invited to the design review?",
    "Do the standup and the design review ever overlap on October 8?",
    "What is my first event next week, starting Monday October 12?",
    "How many events are on my bulk calendar in October 2026?",
    "Pick any three events from the bulk calendar in October and list their titles and times.",
    "Are there any all-day events this week?",
    "Which day this week is the busiest for me?",
    "If I wanted a free hour on Thursday October 8, when would work best?",
    "Summarize my week in two sentences.",
  ],
} as const;

export const DRIVE_CHAT = {
  conversationDrive: "s3",
  turns: [
    "What is in this drive, and what is the rebrand folder about?",
    "Open the brief in the rebrand folder and summarize it.",
    "Who is the brief written for?",
    "What deliverables does the brief list?",
    "Is there a deadline in the brief?",
    "What does welcome.txt say?",
    "Which folders are at the top level of this drive?",
    "What is inside the edge folder?",
    "How many files are there under edge/bulk-2500, roughly?",
    "Search the drive for any file with special characters in its name.",
    "Search for files named like a report or a brief anywhere in the drive.",
    "Which file in the rebrand folder is the largest?",
    "When was the brief last modified?",
    "If I had to share one file with a new teammate to get them started, which one and why?",
    "Summarize what this drive is used for in two sentences.",
  ],
} as const;

export const APPROVAL_CHAT = {
  drive: "webdav",
  parentFolder: "Team/",
  folder: APPROVED_FOLDER,
  turn: `Make a folder called ${APPROVED_FOLDER} in Team on my WebDAV drive.`,
} as const;

export const MCP_CALLS = {
  summarySubject: SUBJECTS.kickoff,
  previewWorkflow: "Triage with the decision model",
  previewLimit: 10,
} as const;

export const WORKSPACE_CHATS = {
  stored: [
    "What needs my attention across my mailboxes this week?",
    "Which of those is the most urgent?",
    "Show me the rebrand kickoff email in full.",
    "Is there anything in my calendar related to the rebrand?",
    "What time is the rebrand review and on which calendar?",
    "Is there a brief for the rebrand in any of my drives?",
    "Summarize that brief in three bullet points.",
    "Does the brief mention the same deadline as the kickoff email?",
    "What else is on my calendar on the day of the review?",
    "Did any order of mine ship recently?",
    "What is the tracking situation for it?",
    "Any money moving out of my accounts lately?",
    "List the labels I have in my mailbox.",
    "How many unread emails are in my inbox right now?",
    "Find emails that look like newsletters or digests.",
    "Which of my drives are connected to this workspace?",
    "Do all of those drives have the same files in them?",
    "Who are the members of this workspace?",
    "Give me a prioritized to-do list for this week based on everything above.",
    "Turn that to-do list into a short status update I could paste into chat.",
  ],
  liveChips: [
    ["What needs my attention across all my mailboxes?"],
    ["Search every mailbox for unpaid invoices"],
    ["Summarize this week's unread mail per mailbox"],
  ],
  live: [
    "List my connected mailboxes",
    "And which calendars are connected?",
    "Which drives do I have?",
    "What is in the rebrand folder on the S3 drive?",
    "Summarize the brief in that folder.",
    "Is there an email about the same project?",
    "What does that email ask me to do?",
    "When is the rebrand review?",
    "What else is on my calendar that week?",
    "Did my order A-42 ship?",
    "What was the latest bank debit?",
    "How many emails are in my inbox?",
    "Which of my 10 newest emails are still unread?",
  ],
} as const;
