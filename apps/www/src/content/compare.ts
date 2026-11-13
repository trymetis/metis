import { DOCS_URL, LICENSE_URL } from "@/lib/site";

import { ENTRY_PLAN, usd } from "./pricing";

export type Cell = { text: string; source?: string };

export const ROWS = [
  { key: "license", label: "License" },
  { key: "selfHost", label: "Self-hosting" },
  { key: "providers", label: "Mail accounts" },
  { key: "calendar", label: "Calendar" },
  { key: "files", label: "Files and drives" },
  { key: "contacts", label: "Contacts" },
  { key: "aiAssistant", label: "AI assistant" },
  { key: "modelChoice", label: "AI model" },
  { key: "mcp", label: "MCP" },
  { key: "automation", label: "Automation" },
  { key: "platforms", label: "Apps" },
  { key: "pricing", label: "Price" },
] as const;

export type RowKey = (typeof ROWS)[number]["key"];

export type Competitor = {
  slug: string;
  name: string;
  maker: string;
  summary: string;
  description: string;
  answer: string;
  pickThem: string;
  pickUs: string;
  checked: string;
  cells: Record<RowKey, Cell>;
};

export const METIS: Record<RowKey, Cell> = {
  license: { text: "Open source, AGPL-3.0-or-later", source: LICENSE_URL },
  selfHost: {
    text: "Yes, on your own Linux server with Docker and the metis CLI, or run for you on Metis Cloud",
    source: `${DOCS_URL}/self-hosting/install/install-with-bootstrap`,
  },
  providers: {
    text: "Gmail, Microsoft 365 and Outlook.com, Zoho Mail, and IMAP servers the instance owner adds",
    source: `${DOCS_URL}/guide/reference/supported-providers`,
  },
  calendar: {
    text: "Google Calendar, Outlook, Zoho Calendar and CalDAV in one view, with editing and RSVPs",
    source: `${DOCS_URL}/guide/reference/supported-providers`,
  },
  files: {
    text: "Google Drive, OneDrive, S3, WebDAV, FTP and SFTP in one explorer, with previews",
    source: `${DOCS_URL}/guide/drive/drive-types`,
  },
  contacts: {
    text: "Google, Outlook, Zoho and CardDAV address books in one list, with contacts saved from mail",
    source: `${DOCS_URL}/guide/contacts/address-book-types`,
  },
  aiAssistant: {
    text: "One agent across mail, calendars, drives and contacts; sending, deleting and every calendar, drive, contact or workflow change waits for your approval",
    source: `${DOCS_URL}/guide/assistant/approve-or-decline-actions`,
  },
  modelChoice: {
    text: "Included every month on Metis Cloud, or bring your own: OpenAI, Anthropic or any OpenAI-compatible endpoint, including one you run yourself",
    source: `${DOCS_URL}/self-hosting/configure/ai-models`,
  },
  mcp: {
    text: "Built-in MCP server with OAuth for Claude, Cursor, Codex and VS Code; sending and deleting stay off until you enable them",
    source: `${DOCS_URL}/guide/assistant/what-an-mcp-client-can-do`,
  },
  automation: {
    text: "Visual workflows on new mail, a schedule, a manual run or before a send, with AI Ask and Branch steps",
    source: `${DOCS_URL}/guide/workflows/triggers`,
  },
  platforms: {
    text: "Web; desktop apps for macOS, Windows and Linux; an Android app; no iPhone app",
    source: `${DOCS_URL}/guide/apps/download`,
  },
  pricing: {
    text: `Free to self-host; Metis Cloud from ${usd(ENTRY_PLAN.cost.yearly / 12)} a month billed yearly, or ${usd(ENTRY_PLAN.cost.monthly)} monthly, per instance`,
  },
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "superhuman",
    name: "Superhuman",
    maker: "Superhuman Platform Inc.",
    summary:
      "An AI email and calendar client for Gmail and Outlook accounts, on the web, desktop and mobile.",
    description:
      "Metis Suite vs Superhuman Mail: open source and self-hostable with your own AI model and MCP, versus a Gmail and Outlook client from $25 a month billed yearly.",
    answer:
      "Superhuman Mail is an AI email and calendar client for Gmail and Outlook accounts, priced from $25 a member a month billed yearly. Metis Suite is open source under AGPL-3.0: you can self-host it free or use Metis Cloud, connect Zoho Mail, IMAP, CalDAV, CardDAV and file servers as well, and run the AI on the model you choose. Both offer an MCP server; in Metis, sending and deleting over MCP stay off until you turn them on.",
    pickThem:
      "Your accounts are all Gmail or Outlook, and you want a subscription client with native iPhone and Android apps.",
    pickUs:
      "You want to own the deployment or the AI model, need Zoho, IMAP, CalDAV, CardDAV or file servers, or want drives and contacts in the same place as mail.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://superhuman.com/legal/terms",
      },
      selfHost: {
        text: "Subscription service; no self-hosting documented",
        source: "https://superhuman.com/legal/terms",
      },
      providers: {
        text: "Gmail and Outlook accounts; generic IMAP is not listed",
        source: "https://superhuman.com/mail/features/email-mcp",
      },
      calendar: {
        text: "Built-in calendar for Google and Outlook calendars",
        source: "https://superhuman.com/mail/calendar",
      },
      files: { text: "Not documented" },
      contacts: { text: "Not documented" },
      aiAssistant: {
        text: "Ask AI (Business plan and up) searches mail, calendar and the web, drafts emails and schedules meetings",
        source: "https://superhuman.com/products/mail/ai",
      },
      modelChoice: { text: "Not documented" },
      mcp: {
        text: "Superhuman Mail MCP on Business and Enterprise; every send needs your approval by default",
        source: "https://superhuman.com/mail/features/email-mcp",
      },
      automation: {
        text: "AI auto labels, split inbox, auto archive and reminders; no general rule builder",
        source: "https://superhuman.com/products/mail/ai",
      },
      platforms: {
        text: "Web (Chrome extension), macOS, Windows, iOS and Android; no Linux app listed",
        source: "https://superhuman.com/apps/mail",
      },
      pricing: {
        text: "Starter $25 and Business $33 per member a month billed yearly, Enterprise by quote; no free plan listed",
        source: "https://superhuman.com/plans/mail",
      },
    },
  },
  {
    slug: "shortwave",
    name: "Shortwave",
    maker: "Shortwave Communications, Inc.",
    summary: "A hosted AI email client for Gmail and Google Workspace accounts.",
    description:
      "Metis Suite vs Shortwave: an open-source client for Gmail, Outlook, Zoho and IMAP with your own AI model, versus a hosted AI email client for Gmail.",
    answer:
      "Shortwave is a hosted AI email client for Gmail and Google Workspace, with an AI assistant on Claude models you pick by intelligence level and plans from free to $120 a month per seat. Metis Suite is open source and self-hostable, works with Microsoft 365, Zoho Mail and IMAP as well as Gmail, and uses whichever model you bring. Shortwave's AI connects to other MCP servers; Metis is itself an MCP server, so your other AI tools can work with your mail, calendars, drives and contacts.",
    pickThem:
      "Your mail is all in Gmail, and you want a free tier and a managed service where you choose a Claude intelligence level.",
    pickUs:
      "You use Outlook, Zoho or IMAP, want to self-host or bring your own model, or want calendars, drives and contacts from several providers in one place.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://www.shortwave.com/policies/terms-of-service/",
      },
      selfHost: {
        text: "Hosted service; no self-hosting documented",
        source: "https://www.shortwave.com/policies/terms-of-service/",
      },
      providers: {
        text: "Gmail and Google Workspace; other services only by forwarding into Gmail; no Microsoft 365 or Exchange",
        source:
          "https://www.shortwave.com/docs/how-tos/microsoft-outlook-exchange-other-sign-in-support/",
      },
      calendar: {
        text: "Google Calendar only, including shared calendars",
        source: "https://www.shortwave.com/docs/guides/ai-assistant/",
      },
      files: {
        text: "No file or drive browser listed; the AI analyzes attachments on paid plans",
        source: "https://www.shortwave.com/pricing/",
      },
      contacts: {
        text: "Contact details in the sidebar and contacts synced from Google Directory; no address book documented",
        source: "https://www.shortwave.com/changelog/",
      },
      aiAssistant: {
        text: "Archives, labels, deletes, drafts and handles invites, and confirms before organizing the inbox",
        source: "https://www.shortwave.com/changelog/",
      },
      modelChoice: {
        text: "Claude Haiku 4.5, Sonnet 4.6 or Opus 4.6 by intelligence level, gated by plan; no own key or local model documented",
        source: "https://www.shortwave.com/pricing/",
      },
      mcp: {
        text: "MCP client in beta: its AI can call other MCP servers on Business plans and up",
        source: "https://www.shortwave.com/docs/how-tos/using-mcp/",
      },
      automation: {
        text: "AI filters in plain English (3 to 50 by plan) that label, archive, delete or star new mail",
        source: "https://www.shortwave.com/pricing/",
      },
      platforms: {
        text: "Web, macOS, Windows, iOS and Android; no Linux app listed",
        source: "https://www.shortwave.com/download/",
      },
      pricing: {
        text: "Free tier and a 14-day trial; Business $30, Premier $45 and Max $120 per seat a month",
        source: "https://www.shortwave.com/pricing/",
      },
    },
  },
  {
    slug: "inbox-zero",
    name: "Inbox Zero",
    maker: "Inbox Zero Inc.",
    summary:
      "An AI email assistant that runs rules in the background on Gmail and Outlook accounts.",
    description:
      "Metis Suite vs Inbox Zero: two self-hostable AI email tools compared on license, mail accounts, calendars, drives, contacts, MCP and price.",
    answer:
      "Inbox Zero is an AI email assistant for Gmail and Outlook that runs rules in the background, with a hosted service from $18 a month per user billed yearly and a self-hosted option. Its license adds terms to the AGPL, including an enterprise license for organizations with 5 or more business users. Metis Suite is plain AGPL-3.0-or-later, adds Zoho Mail and IMAP, and puts calendars, drives and contacts from several providers next to mail, with one agent across all of them.",
    pickThem:
      "You mainly want AI rules triaging Gmail or Outlook in the background, with extras such as filing attachments into Drive or OneDrive folders.",
    pickUs:
      "You want a full client for mail, calendars, drives and contacts, need Zoho or IMAP, or want an unmodified AGPL license for a team of any size.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "AGPL-3.0 with added terms: no paid resale without permission, and an enterprise license for 5 or more business users",
        source: "https://github.com/elie222/inbox-zero/blob/main/LICENSE",
      },
      selfHost: {
        text: "Yes, with guides for Docker on a VPS, AWS or Vercel",
        source: "https://docs.getinboxzero.com/hosting/quick-start",
      },
      providers: {
        text: "Gmail and Outlook / Microsoft 365; IMAP is not listed",
        source: "https://docs.getinboxzero.com/introduction",
      },
      calendar: {
        text: "Connects Google and Outlook calendars for availability, scheduling replies and meeting briefs",
        source: "https://docs.getinboxzero.com/essentials/calendar-integration",
      },
      files: {
        text: "Files email attachments into Google Drive or OneDrive folders you pick",
        source: "https://docs.getinboxzero.com/essentials/auto-file-attachments",
      },
      contacts: { text: "Not documented" },
      aiAssistant: {
        text: "AI chat searches, archives, deletes, labels and unsubscribes, and sends only from a confirmation card",
        source: "https://docs.getinboxzero.com/essentials/ai-chat",
      },
      modelChoice: {
        text: "Own key for many providers; self-hosters can also use Ollama or OpenAI-compatible servers",
        source: "https://docs.getinboxzero.com/hosting/llm-setup",
      },
      mcp: {
        text: "Remote MCP server that searches mail, creates drafts and manages rules, but cannot send",
        source: "https://docs.getinboxzero.com/essentials/mcp",
      },
      automation: {
        text: "Plain-English rules that label, archive, forward, draft replies or call webhooks as mail arrives",
        source: "https://docs.getinboxzero.com/essentials/email-ai-personal-assistant",
      },
      platforms: {
        text: "Web, macOS, Windows, iPhone and an older Android app; no Linux desktop build",
        source: "https://www.getinboxzero.com/download",
      },
      pricing: {
        text: "Email app free; AI plans from $18 a month billed yearly ($20 monthly) to $50 per user monthly, Enterprise custom",
        source: "https://www.getinboxzero.com/pricing",
      },
    },
  },
  {
    slug: "thunderbird",
    name: "Thunderbird",
    maker: "Thunderbird Technologies Corporation, part of the Mozilla family",
    summary: "Mozilla's free, open-source email and calendar app for desktop and Android.",
    description:
      "Metis Suite vs Thunderbird: a self-hosted web suite with an AI agent, drives and MCP, versus Mozilla's free desktop and Android email app.",
    answer:
      "Thunderbird is Mozilla's free, open-source email and calendar app for Windows, macOS, Linux and Android. Metis Suite runs on a server and opens in any browser or its desktop app, so every device and teammate sees the same accounts, and it adds an AI agent with approvals, workflows, an MCP server and file drives. Thunderbird suits local mail on one machine; Metis suits a shared, AI-ready workspace.",
    pickThem: "You want a local desktop app with add-ons and no server to run.",
    pickUs:
      "You want one instance for every device and teammate, an AI agent that asks before it acts, MCP, or drives next to mail.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Open source under the MPL",
        source: "https://www.mozilla.org/en-US/foundation/licensing/",
      },
      selfHost: {
        text: "Not applicable: a desktop and Android app, not a server",
        source: "https://www.thunderbird.net/en-US/",
      },
      providers: {
        text: "IMAP, Exchange (EWS) and Microsoft 365 (Graph, from version 154)",
        source:
          "https://blog.thunderbird.net/2026/09/thunderbird-desktop-new-protocol-support-microsoft-graph-api/",
      },
      calendar: {
        text: "Built-in calendar for local, CalDAV and ICS calendars; no Exchange or Microsoft 365 calendars yet",
        source: "https://github.com/thunderbird/thunderbird-desktop/tree/main/calendar/providers",
      },
      files: {
        text: "No drive browser documented; Thundermail plans include large encrypted file sending",
        source: "https://tb.pro/",
      },
      contacts: {
        text: "Built-in address book; not yet for Exchange or Microsoft 365 accounts",
        source:
          "https://blog.thunderbird.net/2026/09/thunderbird-desktop-new-protocol-support-microsoft-graph-api/",
      },
      aiAssistant: { text: "Not documented" },
      modelChoice: { text: "Not documented" },
      mcp: { text: "Not documented" },
      automation: {
        text: "Message filters and add-ons",
        source: "https://www.thunderbird.net/en-US/",
      },
      platforms: {
        text: "Windows, macOS, Linux and Android; iOS in development",
        source:
          "https://blog.thunderbird.net/2026/10/thunderbird-for-ios-a-first-look-at-the-native-iphone-email-app-in-development/",
      },
      pricing: {
        text: "Apps free and donation-funded; Thundermail $6 a month billed yearly, in beta with a waitlist",
        source: "https://tb.pro/",
      },
    },
  },
  {
    slug: "mailspring",
    name: "Mailspring",
    maker: "Foundry376",
    summary: "A native desktop email client for macOS, Windows and Linux.",
    description:
      "Metis Suite vs Mailspring: a self-hosted web suite with calendars, drives and an AI agent, versus a native desktop email client with Pro at $8 a month.",
    answer:
      "Mailspring is a native desktop email client for macOS, Windows and Linux, open source under GPL-3.0, with Mailspring Pro at $8 a month and a local MCP server since version 1.23. Metis Suite runs on a server and works in any browser, so phones and teammates reach the same accounts, and it adds a built-in AI agent with approvals, workflows, and drives from Google, Microsoft and your own servers.",
    pickThem:
      "You want a native desktop app that syncs directly with your provider, with no server to run.",
    pickUs:
      "You want a web suite for every device, shared mailboxes for a team, a built-in agent, or file drives next to mail.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "GPL-3.0 per the repository (the homepage says MIT)",
        source: "https://github.com/Foundry376/Mailspring/blob/master/LICENSE.md",
      },
      selfHost: {
        text: "No server to run; mail syncs directly with your provider, not through Mailspring's servers",
        source: "https://www.getmailspring.com/",
      },
      providers: {
        text: "Gmail, iCloud, Office 365, Fastmail, Outlook.com, Yahoo and any IMAP/SMTP server",
        source: "https://www.getmailspring.com/",
      },
      calendar: {
        text: "CalDAV calendar with day, week and month views in recent releases",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.26.0",
      },
      files: {
        text: "Attachments with PDF preview; no drive browser documented",
        source: "https://www.getmailspring.com/",
      },
      contacts: {
        text: "Contacts sync over CardDAV and Google, with a contact editor",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.26.0",
      },
      aiAssistant: {
        text: "No built-in assistant documented; local agents can use its MCP server",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.23.0",
      },
      modelChoice: { text: "Not documented" },
      mcp: {
        text: "Local MCP server for local agents, off by default",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.23.0",
      },
      automation: {
        text: "Mail rules per account; snooze, follow-up reminders and send later with Pro",
        source: "https://www.getmailspring.com/pro",
      },
      platforms: {
        text: "Native app for macOS, Windows and Linux; no web or mobile app listed",
        source: "https://www.getmailspring.com/",
      },
      pricing: {
        text: "Free with a few Pro uses each week; Pro $8 a month",
        source: "https://www.getmailspring.com/",
      },
    },
  },
  {
    slug: "roundcube",
    name: "Roundcube",
    maker: "The Roundcube project, stewarded by Nextcloud GmbH",
    summary: "A long-running, self-hosted webmail client for IMAP servers.",
    description:
      "Metis Suite vs Roundcube: two self-hosted, open-source webmail clients compared on mail accounts, calendars, drives, AI, MCP and automation.",
    answer:
      "Roundcube is the long-running open-source webmail client for IMAP servers, running on PHP 8.1 or later and stewarded by Nextcloud GmbH, with a built-in address book and calendars, files and AI only through third-party plugins. Metis Suite is also self-hosted and open source, and adds Gmail, Microsoft 365 and Zoho through their APIs, calendars, drives and contacts from several providers, a built-in AI agent with approvals, workflows and an MCP server.",
    pickThem:
      "You run your own IMAP server and want a PHP webmail with a built-in address book, the managesieve plugin and third-party plugins.",
    pickUs:
      "Your accounts are spread across Google, Microsoft, Zoho and your own servers, or you want AI, workflows and MCP built in.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Open source, GPL-3.0-or-later",
        source: "https://roundcube.net/about/",
      },
      selfHost: {
        text: "Self-hosted only: PHP 8.1+, a database and an existing IMAP/SMTP server",
        source: "https://roundcube.net/about/",
      },
      providers: {
        text: "Any IMAP server the operator configures, with OAuth configurable (Gmail and Outlook.com examples); more accounts per login through plugins",
        source: "https://github.com/roundcube/roundcubemail/blob/master/config/defaults.inc.php",
      },
      calendar: {
        text: "None built in; third-party plugins",
        source: "https://roundcube.net/about/",
      },
      files: {
        text: "None built in; third-party plugins",
        source: "https://packagist.org/packages/gecka/nextbridge",
      },
      contacts: {
        text: "Built-in address book with groups and LDAP connectors",
        source: "https://roundcube.net/about/",
      },
      aiAssistant: {
        text: "None in core; third-party plugins help write and summarize",
        source: "https://packagist.org/packages/cymdeveloppement/roundcube-ai",
      },
      modelChoice: {
        text: "Not in core; some plugins take any OpenAI-compatible endpoint",
        source: "https://packagist.org/packages/mazzz1y/roundcube-ai",
      },
      mcp: { text: "Not documented" },
      automation: {
        text: "Server-side Sieve filters through the bundled managesieve plugin",
        source: "https://github.com/roundcube/roundcubemail/tree/master/plugins/managesieve",
      },
      platforms: {
        text: "Web only, with a responsive skin; no native mobile apps",
        source: "https://roundcube.net/support/",
      },
      pricing: {
        text: "Free; official enterprise support from Nextcloud GmbH",
        source: "https://roundcube.net/support/",
      },
    },
  },
  {
    slug: "gmail-gemini",
    name: "Gmail with Gemini",
    maker: "Google",
    summary: "Google's email service with Gemini AI, through Google AI plans or Google Workspace.",
    description:
      "Metis Suite vs Gmail with Gemini: one open-source client for Gmail, Outlook, Zoho and IMAP with your own AI model, versus Google's own AI in Gmail.",
    answer:
      "Gmail with Gemini is Google's mail with a Gemini side panel that summarizes, drafts, searches and, after you confirm, archives, deletes or labels mail; it needs an eligible Google AI or Google Workspace plan. Metis Suite is an open-source client that works with your Gmail account alongside Outlook, Zoho Mail, IMAP, other calendars, contacts and file servers, and its AI runs on the model you choose. You keep Gmail as your provider either way.",
    pickThem: "Everything you use is in Google, and Gemini is the AI you want.",
    pickUs:
      "You also use Outlook, Zoho, IMAP or your own servers, want to choose the AI model, or want to self-host the client.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://policies.google.com/terms",
      },
      selfHost: {
        text: "Hosted by Google; no self-hosted plan listed",
        source: "https://workspace.google.com/intl/en/pricing.html?region=US",
      },
      providers: {
        text: "Gmail and Workspace accounts; the mobile apps add IMAP accounts such as Outlook, while the web drops POP fetching and phases out Gmailify by January 2027",
        source: "https://support.google.com/mail/answer/16604719?hl=en",
      },
      calendar: {
        text: "Google Calendar in Gmail's side panel; Gemini creates events on your primary calendar",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      files: {
        text: "No file browser in Gmail; Gemini can use Drive files and move, rename, share or copy them",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      contacts: {
        text: "Google Contacts in Gmail's side panel",
        source: "https://support.google.com/mail/answer/106237?hl=en&co=GENIE.Platform%3DDesktop",
      },
      aiAssistant: {
        text: "Gemini side panel summarizes, drafts and searches, and archives, deletes or labels after you confirm",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      modelChoice: {
        text: "Google's Gemini models",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      mcp: {
        text: "Workspace MCP servers in Developer Preview, with a Google Cloud project",
        source: "https://developers.google.com/workspace/guides/configure-mcp-servers",
      },
      automation: {
        text: "Gmail filters that label, archive, delete, star or forward",
        source: "https://support.google.com/mail/answer/6579?hl=en",
      },
      platforms: {
        text: "Web, Android, iPhone and iPad",
        source: "https://support.google.com/mail/answer/6078445?hl=en&co=GENIE.Platform%3DiOS",
      },
      pricing: {
        text: "Gemini in Gmail needs a paid plan, from Google AI Plus at $4.99 a month",
        source: "https://gemini.google/us/subscriptions/?hl=en",
      },
    },
  },
  {
    slug: "outlook-copilot",
    name: "Outlook with Copilot",
    maker: "Microsoft",
    summary: "Microsoft's email and calendar app with Copilot AI, through Microsoft 365 plans.",
    description:
      "Metis Suite vs Outlook with Copilot: an open-source client with your own AI model, calendars and drives from many providers, versus Microsoft's AI in Outlook.",
    answer:
      "Outlook with Copilot is Microsoft's email and calendar app with Copilot for drafting, summarizing and triaging mail, included in Microsoft 365 consumer plans and sold to businesses as Copilot add-ons. Outlook also adds Gmail and IMAP accounts. Metis Suite is open source and self-hostable, adds Zoho, CalDAV, CardDAV and file drives such as Google Drive, S3 and SFTP, runs its agent on the model you choose, and asks before every send or delete.",
    pickThem:
      "Your organization runs on Microsoft 365, and you want Copilot across Word, Excel and Teams as well as Outlook.",
    pickUs:
      "You want to self-host, choose the AI model, use Linux, or bring Google, Zoho and your own servers into the same suite.",
    checked: "2026-11-06",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://www.microsoft.com/en-us/servicesagreement",
      },
      selfHost: {
        text: "No; new Outlook does not support on-premises Exchange accounts",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/supported-account-types",
      },
      providers: {
        text: "Microsoft 365 and Outlook.com, plus Gmail, Yahoo, iCloud and other IMAP or POP accounts in new Outlook",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/supported-account-types",
      },
      calendar: {
        text: "Built-in Outlook calendar",
        source:
          "https://support.microsoft.com/en-us/outlook/getstarted/feature-comparison-between-new-outlook-and-classic-outlook",
      },
      files: { text: "Not documented" },
      contacts: {
        text: "Built-in People: contacts and contact lists",
        source:
          "https://support.microsoft.com/en-us/outlook/getstarted/feature-comparison-between-new-outlook-and-classic-outlook",
      },
      aiAssistant: {
        text: "Copilot archives, deletes, moves and categorizes mail, asking first only when more than five emails are affected",
        source:
          "https://support.microsoft.com/en-us/outlook/triage-email-with-microsoft-365-copilot-in-outlook",
      },
      modelChoice: {
        text: "Microsoft-provided OpenAI and Anthropic models; no own key or local model documented",
        source: "https://www.microsoft.com/en-us/copilot/pricing/business",
      },
      mcp: {
        text: "Work IQ MCP server for Microsoft 365 data, with Entra ID sign-in",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq/mcp/overview",
      },
      automation: {
        text: "Outlook rules, partly available in new Outlook; Copilot can edit them after you approve",
        source:
          "https://support.microsoft.com/en-us/outlook/create-and-view-outlook-rules-with-microsoft-365-copilot",
      },
      platforms: {
        text: "Windows, Mac, web, iOS and Android; no Linux app listed",
        source:
          "https://support.microsoft.com/en-us/outlook/triage-email-with-microsoft-365-copilot-in-outlook",
      },
      pricing: {
        text: "Microsoft 365 Copilot Business add-on $18 per user a month billed yearly, or $25.20 monthly",
        source: "https://www.microsoft.com/en-us/copilot/pricing/business",
      },
    },
  },
];
