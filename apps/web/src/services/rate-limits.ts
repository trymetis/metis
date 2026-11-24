export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSec: number;
}

export interface PathRateLimit {
  limit: number;
  windowSec: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const stepUp = (scope: string, limit = 10): RateLimitRule => ({
  scope,
  limit,
  windowSec: 5 * MINUTE,
});

export const RATE_LIMITS = {
  mailSession: { scope: "mail-session", limit: 300, windowSec: MINUTE },
  calendarSession: { scope: "calendar-session", limit: 300, windowSec: MINUTE },
  driveSession: { scope: "drive-session", limit: 300, windowSec: MINUTE },
  addressBookSession: { scope: "address-book-session", limit: 300, windowSec: MINUTE },

  mailSend: { scope: "mail-send", limit: 60, windowSec: MINUTE },
  scheduleSend: { scope: "schedule-send", limit: 30, windowSec: MINUTE },
  resolveSend: { scope: "resolve-send", limit: 20, windowSec: MINUTE },
  mailImageProxy: { scope: "mail-image-proxy", limit: 600, windowSec: MINUTE },
  mailContacts: { scope: "mail-contacts", limit: 20, windowSec: MINUTE },
  mailUnsubscribeInfo: { scope: "mail-unsubscribe-info", limit: 60, windowSec: MINUTE },
  mailUnsubscribe: { scope: "mail-unsubscribe", limit: 30, windowSec: MINUTE },
  mailSubscriptionsScan: { scope: "mail-subscriptions-scan", limit: 10, windowSec: 5 * MINUTE },

  mailClassify: { scope: "mail-classify", limit: 30, windowSec: MINUTE },
  threadSummary: { scope: "thread-summary", limit: 30, windowSec: MINUTE },
  phishingAnalyze: { scope: "phishing-analyze", limit: 30, windowSec: MINUTE },
  smartReplies: { scope: "smart-replies", limit: 30, windowSec: MINUTE },
  draftApology: { scope: "draft-apology", limit: 30, windowSec: MINUTE },
  draftStance: { scope: "draft-stance", limit: 30, windowSec: MINUTE },
  rewriteText: { scope: "rewrite-text", limit: 30, windowSec: MINUTE },
  aiChat: { scope: "ai-chat", limit: 20, windowSec: MINUTE },
  aiWorkspaceChat: { scope: "ai-workspace-chat", limit: 20, windowSec: MINUTE },
  agentReferenceSuggest: { scope: "agent-reference-suggest", limit: 240, windowSec: MINUTE },

  search: { scope: "search", limit: 240, windowSec: MINUTE },
  searchSuggest: { scope: "search-suggest", limit: 240, windowSec: MINUTE },

  driveDownload: { scope: "drive-download", limit: 120, windowSec: MINUTE },
  driveRelayDownload: { scope: "drive-relay-download", limit: 120, windowSec: MINUTE },
  driveRelayUpload: { scope: "drive-relay-upload", limit: 600, windowSec: MINUTE },

  mcp: { scope: "mcp", limit: 120, windowSec: MINUTE },
  mcpClientCreate: stepUp("mcp-client-create"),
  mcpClientEnable: stepUp("mcp-client-enable"),
  mcpConsentRegister: stepUp("mcp-consent-register"),
  cimdMetadataFetch: { scope: "cimd-metadata-fetch", limit: 20, windowSec: MINUTE },

  workflowTestRun: { scope: "workflow-test-run", limit: 10, windowSec: MINUTE },
  workflowDecisionPreview: { scope: "workflow-decision-preview", limit: 10, windowSec: MINUTE },
  workflowInbound: { scope: "workflow-inbound", limit: 120, windowSec: MINUTE },

  inviteSend: { scope: "invite-send", limit: 100, windowSec: HOUR },
  signupFirst: { scope: "signup-first", limit: 10, windowSec: HOUR },
  signupInvitePreview: { scope: "signup-invite-preview", limit: 30, windowSec: HOUR },
  signupInvite: { scope: "signup-invite", limit: 10, windowSec: HOUR },
  connectionsCredential: { scope: "connections-credential", limit: 10, windowSec: HOUR },

  userPreferences: { scope: "user-preferences", limit: 30, windowSec: MINUTE },
  dataExport: { scope: "data-export", limit: 5, windowSec: 10 * MINUTE },
  deleteAccount: stepUp("delete-account", 5),
  transferOwnership: stepUp("transfer-ownership"),

  mailboxPolicyOn: stepUp("mailbox-policy-on"),
  calendarAiOn: stepUp("calendar-ai-on"),
  driveAiOn: stepUp("drive-ai-on"),
  addressBookAiOn: stepUp("address-book-ai-on"),
  workspaceDelete: stepUp("workspace-delete"),
  workspacePolicy: stepUp("workspace-policy"),
  memberRole: stepUp("member-role"),
  instanceUsers: stepUp("instance-users"),
  instanceConfig: stepUp("instance-config"),
  instanceUpdate: stepUp("instance-update"),
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export const AUTH_RATE_LIMIT_SCOPE = "auth";

export interface AuthRateLimits {
  default: PathRateLimit;
  twoFactor: PathRateLimit;
  paths: Record<string, PathRateLimit | false>;
}

export const AUTH_RATE_LIMITS: AuthRateLimits = {
  default: { limit: 60, windowSec: MINUTE },
  twoFactor: { limit: 3, windowSec: 10 },
  paths: {
    "/get-session": false,
    "/sign-in/email": { limit: 10, windowSec: MINUTE },
    "/sign-in/magic-link": { limit: 5, windowSec: HOUR },
    "/sign-up/email": { limit: 5, windowSec: HOUR },
    "/request-password-reset": { limit: 5, windowSec: HOUR },
    "/send-verification-email": { limit: 5, windowSec: HOUR },
    "/two-factor/verify": { limit: 10, windowSec: MINUTE },
    "/native/code": { limit: 10, windowSec: MINUTE },
    "/native/exchange": { limit: 10, windowSec: MINUTE },
    "/native/connect-ticket": { limit: 20, windowSec: MINUTE },
    "/magic-link/verify": { limit: 5, windowSec: MINUTE },
    "/oauth2/authorize": { limit: 30, windowSec: MINUTE },
    "/oauth2/token": { limit: 20, windowSec: MINUTE },
    "/oauth2/register": { limit: 5, windowSec: MINUTE },
    "/oauth2/introspect": { limit: 100, windowSec: MINUTE },
    "/oauth2/revoke": { limit: 30, windowSec: MINUTE },
    "/oauth2/userinfo": { limit: 60, windowSec: MINUTE },
    "/oauth2/client/rotate-keys": { limit: 5, windowSec: MINUTE },
    "/sign-in/*": { limit: 3, windowSec: 10 },
    "/sign-up/*": { limit: 3, windowSec: 10 },
    "/change-password": { limit: 3, windowSec: 10 },
    "/change-email": { limit: 3, windowSec: 10 },
  },
};
