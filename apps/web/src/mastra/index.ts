import "server-only";
import { Mastra } from "@mastra/core/mastra";

import { calendarAgent } from "./agents/calendar-agent";
import { classifierAgent } from "./agents/classifier";
import { contactsAgent } from "./agents/contacts-agent";
import { drafterAgent } from "./agents/drafter";
import { driveAgent } from "./agents/drive-agent";
import { mailboxAgent } from "./agents/mailbox-agent";
import { summarizerAgent } from "./agents/summarizer";
import { WORKFLOW_AGENTS, workflowWriterAgent } from "./agents/workflow-agents";
import { workspaceAgent } from "./agents/workspace-agent";
import { storage } from "./storage";

export const mastra = new Mastra({
  agents: {
    mailboxAgent,
    calendarAgent,
    driveAgent,
    contactsAgent,
    workspaceAgent,
    drafterAgent,
    summarizerAgent,
    classifierAgent,
    workflowWriterAgent,
    workflowMailboxAgent: WORKFLOW_AGENTS.mailbox,
    workflowCalendarAgent: WORKFLOW_AGENTS.calendar,
    workflowDriveAgent: WORKFLOW_AGENTS.drive,
    workflowWorkspaceAgent: WORKFLOW_AGENTS.workspace,
  },
  storage,
});
