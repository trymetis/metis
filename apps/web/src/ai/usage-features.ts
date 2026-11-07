export const AI_USAGE_FEATURES = [
  "thread-summary",
  "smart-replies",
  "draft-reply",
  "classify",
  "mailbox-chat",
  "calendar-chat",
  "drive-chat",
  "contacts-chat",
  "workspace-chat",
  "summary-gate",
  "workflow-decision",
  "workflow-ai",
  "workflow-agent",
] as const;

export type AiUsageFeature = (typeof AI_USAGE_FEATURES)[number];

export const AI_USAGE_FEATURE_LABELS: Record<AiUsageFeature, string> = {
  "thread-summary": "Thread summary",
  "smart-replies": "Smart replies",
  "draft-reply": "Draft reply",
  classify: "Classify",
  "mailbox-chat": "Mailbox agent",
  "calendar-chat": "Calendar agent",
  "drive-chat": "Drive agent",
  "contacts-chat": "Contacts agent",
  "workspace-chat": "Workspace agent",
  "summary-gate": "Summary gate",
  "workflow-decision": "Workflow decision",
  "workflow-ai": "Workflow AI step",
  "workflow-agent": "Workflow agent",
};
