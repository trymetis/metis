import { DOCS_URL, LICENSE_URL } from "@/lib/site";

import { ENTRY_PLAN, usd } from "./pricing";

export type Cell = { text: string; source?: string };

export const ROWS = [
  { key: "license", label: "License" },
  { key: "selfHost", label: "Self-hosting" },
  { key: "providers", label: "Mail accounts" },
  { key: "calendar", label: "Calendar" },
  { key: "files", label: "Files and drives" },
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
    text: "Yes, with Docker Compose on your own Linux server, or run for you on Metis Cloud",
    source: `${DOCS_URL}/self-hosting/install/install-with-docker-compose`,
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
  aiAssistant: {
    text: "One agent across mail, calendars and drives; sending, deleting and every calendar, drive or workflow change waits for your approval",
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
    maker: "Superhuman (formerly Grammarly)",
    summary: "A hosted, keyboard-driven email and calendar client for Gmail and Outlook accounts.",
    description:
      "Metis Suite vs Superhuman Mail: open source and self-hostable with your own AI model and MCP, versus a hosted Gmail and Outlook client from $30 a month.",
    answer:
      "Superhuman Mail is a fast, hosted email and calendar client for Gmail and Outlook accounts, priced from $30 a month per user. Metis Suite is open source under AGPL-3.0: you can self-host it free or use Metis Cloud, connect Zoho Mail, IMAP, CalDAV and file servers as well, and run the AI on the model you choose. Both offer an MCP server; in Metis, sending and deleting over MCP stay off until you turn them on.",
    pickThem:
      "Your accounts are all Gmail or Outlook, and you want a fully managed client with a native iPhone app.",
    pickUs:
      "You want to own the deployment or the AI model, need Zoho, IMAP, CalDAV or file servers, or want drives in the same place as mail.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://superhuman.com/legal/terms",
      },
      selfHost: {
        text: "No, hosted per-seat subscription only",
        source:
          "https://help.superhuman.com/hc/en-us/articles/46005588676237-Superhuman-AI-Overview",
      },
      providers: {
        text: "Gmail and Outlook accounts; generic IMAP is not listed",
        source: "https://superhuman.com/mail/features/email-mcp",
      },
      calendar: {
        text: "Built-in calendar for Google and Outlook calendars",
        source: "https://superhuman.com/mail/calendar",
      },
      files: {
        text: "No file or drive browser listed; the AI reads attachments in threads",
        source: "https://help.superhuman.com/hc/en-us/articles/46005792429965-Your-AI-Assistant",
      },
      aiAssistant: {
        text: "Ask AI (Business plan and up) searches mail and calendar, drafts emails and creates events; you send yourself",
        source: "https://help.superhuman.com/hc/en-us/articles/46005792429965-Your-AI-Assistant",
      },
      modelChoice: { text: "Not documented" },
      mcp: {
        text: "Hosted MCP server on Business and Enterprise; its send tool can send immediately unless your AI client asks first",
        source:
          "https://help.superhuman.com/hc/en-us/articles/46005696690317-Superhuman-Mail-MCP-Server",
      },
      automation: {
        text: "AI auto labels, split inbox, auto archive and reminders; no general rule builder",
        source: "https://help.superhuman.com/hc/en-us/articles/46005662460813-Auto-Archive",
      },
      platforms: {
        text: "Web, macOS, Windows, iOS and Android; no Linux app listed",
        source: "https://superhuman.com/apps/mail",
      },
      pricing: {
        text: "Starter $30 a month ($300 a year), Business $40 a month ($396 a year), Enterprise by quote; no free plan",
        source: "https://help.superhuman.com/hc/en-us/articles/46178817646861-Pricing-Plans",
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
      "Shortwave is a hosted AI email client for Gmail and Google Workspace, with an AI assistant on Claude models Shortwave chooses and plans from free to $120 a month per seat. Metis Suite is open source and self-hostable, works with Microsoft 365, Zoho Mail and IMAP as well as Gmail, and uses whichever model you bring. Shortwave's AI connects to other MCP servers; Metis is itself an MCP server, so your other AI tools can work with your mail, calendars and drives.",
    pickThem:
      "Your mail is all in Gmail, and you want a free tier and a managed service with the AI models Shortwave picks.",
    pickUs:
      "You use Outlook, Zoho or IMAP, want to self-host or bring your own model, or want calendars and drives from several providers in one place.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://www.shortwave.com/policies/terms-of-service/",
      },
      selfHost: {
        text: "No, hosted service with data in Google Cloud",
        source: "https://www.shortwave.com/pricing/",
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
      aiAssistant: {
        text: "Archives, labels, deletes, drafts and handles invites, and confirms before organizing the inbox",
        source: "https://www.shortwave.com/changelog/",
      },
      modelChoice: {
        text: "Vendor-hosted Claude models by plan; no own key or local model documented",
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
        text: "Free; Pro $18, Business $30, Premier $45 and Max $120 per seat a month, billed monthly",
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
      "Metis Suite vs Inbox Zero: two self-hostable AI email tools compared on license, mail accounts, calendars, drives, MCP and price.",
    answer:
      "Inbox Zero is an AI email assistant for Gmail and Outlook that runs rules in the background, with a hosted service from $18 a month per user and a self-hosted option. Its license adds terms to the AGPL, including an enterprise license for organizations with 5 or more business users. Metis Suite is plain AGPL-3.0-or-later, adds Zoho Mail and IMAP, and puts calendars and drives from several providers next to mail, with one agent across all of them.",
    pickThem:
      "You mainly want AI rules triaging Gmail or Outlook in the background, with extras such as filing attachments into Drive or OneDrive folders.",
    pickUs:
      "You want a full client for mail, calendars and drives, need Zoho or IMAP, or want an unmodified AGPL license for a team of any size.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "AGPL-3.0 with added terms: no paid resale without permission, and an enterprise license for 5 or more business users",
        source: "https://github.com/elie222/inbox-zero/blob/main/LICENSE",
      },
      selfHost: {
        text: "Yes, with Docker, Kubernetes, AWS, GCP or Vercel",
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
        text: "No drive browser; files attachments into chosen Google Drive or OneDrive folders",
        source: "https://docs.getinboxzero.com/essentials/auto-file-attachments",
      },
      aiAssistant: {
        text: "AI chat searches, archives, deletes, labels and unsubscribes, and confirms high-impact actions such as sending",
        source: "https://docs.getinboxzero.com/essentials/security-and-data",
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
        text: "Email app free; AI plans from $18 a month billed yearly ($20 monthly) to $50 per user, Enterprise by quote",
        source: "https://www.getinboxzero.com/pricing",
      },
    },
  },
  {
    slug: "thunderbird",
    name: "Thunderbird",
    maker: "MZLA Technologies, a Mozilla Foundation subsidiary",
    summary: "Mozilla's free, open-source email and calendar app for desktop and Android.",
    description:
      "Metis Suite vs Thunderbird: a self-hosted web suite with an AI agent, drives and MCP, versus Mozilla's free desktop and Android email app.",
    answer:
      "Thunderbird is Mozilla's free, open-source email and calendar app for Windows, macOS, Linux and Android, with no built-in AI. Metis Suite runs on a server and opens in any browser or its desktop app, so every device and teammate sees the same accounts, and it adds an AI agent with approvals, workflows, an MCP server and file drives. Thunderbird suits local, offline mail on one machine; Metis suits a shared, AI-ready workspace.",
    pickThem:
      "You want a local desktop app with offline mail, POP support and add-ons, and no server to run.",
    pickUs:
      "You want one instance for every device and teammate, an AI agent that asks before it acts, MCP, or drives next to mail.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Open source: MPL-2.0 (desktop), Apache-2.0 (Android)",
        source: "https://www.mozilla.org/en-US/foundation/licensing/",
      },
      selfHost: {
        text: "A local app, not a server; works with any mail service, including your own",
        source: "https://www.thunderbird.net/en-US/",
      },
      providers: {
        text: "IMAP, POP, Exchange (EWS) and Microsoft 365 mail (Graph, from version 154)",
        source:
          "https://blog.thunderbird.net/2026/09/thunderbird-desktop-new-protocol-support-microsoft-graph-api/",
      },
      calendar: {
        text: "Built-in calendar for local, CalDAV (Google included) and ICS; no native Exchange or Microsoft 365 calendars yet",
        source: "https://github.com/thunderbird/thunderbird-desktop/tree/main/calendar/providers",
      },
      files: {
        text: "No drive browser; Thundermail plans include large-file sharing",
        source: "https://tb.pro/",
      },
      aiAssistant: {
        text: "None built in",
        source: "https://addons.thunderbird.net/en-US/thunderbird/addon/thunderbird-assist/",
      },
      modelChoice: { text: "Not applicable; the mail apps ship no AI" },
      mcp: { text: "None announced for the mail apps" },
      automation: {
        text: "Message filters on desktop, plus add-ons",
        source: "https://www.thunderbird.net/en-US/",
      },
      platforms: {
        text: "Windows, macOS, Linux and Android; iOS in development",
        source:
          "https://blog.thunderbird.net/2026/10/thunderbird-for-ios-a-first-look-at-the-native-iphone-email-app-in-development/",
      },
      pricing: {
        text: "Apps free and donation-funded; Thundermail hosted mail from $6 a month billed yearly, in beta",
        source: "https://tb.pro/",
      },
    },
  },
  {
    slug: "mailspring",
    name: "Mailspring",
    maker: "Foundry 376",
    summary: "A native desktop email client for macOS, Windows and Linux.",
    description:
      "Metis Suite vs Mailspring: a self-hosted web suite with calendars, drives and an AI agent, versus a native desktop email client with Pro at $8 a month.",
    answer:
      "Mailspring is a native desktop email client for macOS, Windows and Linux, open source under GPL-3.0, with Mailspring Pro at $8 a month and a local MCP server since version 1.23. Metis Suite runs on a server and works in any browser, so phones and teammates reach the same accounts, and it adds a built-in AI agent with approvals, workflows, and drives from Google, Microsoft and your own servers.",
    pickThem:
      "You want a native desktop app that syncs directly with your provider, with no server to run.",
    pickUs:
      "You want a web suite for every device, shared mailboxes for a team, a built-in agent, or file drives next to mail.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "GPL-3.0 per the repository (the homepage says MIT)",
        source: "https://github.com/Foundry376/Mailspring/blob/master/LICENSE.md",
      },
      selfHost: {
        text: "No server; a desktop app that syncs directly with your provider",
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
        text: "No drive browser; attachments with preview",
        source: "https://www.getmailspring.com/",
      },
      aiAssistant: {
        text: "None built in; local agents connect over MCP",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.24.1",
      },
      modelChoice: {
        text: "No bundled model; you bring your own MCP client",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.24.1",
      },
      mcp: {
        text: "Local MCP server, off by default, with one access level from read-only to read-write-send",
        source: "https://github.com/Foundry376/Mailspring/releases/tag/1.23.0",
      },
      automation: {
        text: "Client-side mail rules, snooze, reminders and send later",
        source:
          "https://github.com/Foundry376/Mailspring/blob/master/app/internal_packages/preferences/lib/tabs/preferences-mail-rules.tsx",
      },
      platforms: {
        text: "macOS, Windows and Linux; no web or mobile app",
        source: "https://www.getmailspring.com/",
      },
      pricing: {
        text: "Free with weekly limits on Pro features; Pro $8 a month",
        source: "https://www.getmailspring.com/pro",
      },
    },
  },
  {
    slug: "roundcube",
    name: "Roundcube",
    maker: "The Roundcube project, run by Nextcloud GmbH",
    summary: "A long-running, self-hosted webmail client for IMAP servers.",
    description:
      "Metis Suite vs Roundcube: two self-hosted, open-source webmail clients compared on mail accounts, calendars, drives, AI, MCP and automation.",
    answer:
      "Roundcube is the long-running open-source webmail client for IMAP servers, written in PHP and run by Nextcloud GmbH, with calendars, files and AI only through third-party plugins. Metis Suite is also self-hosted and open source, and adds Gmail, Microsoft 365 and Zoho through their APIs, calendars and drives from several providers, a built-in AI agent with approvals, workflows and an MCP server.",
    pickThem:
      "You run your own IMAP server and want a mature PHP webmail with Sieve filters and a large plugin catalog.",
    pickUs:
      "Your accounts are spread across Google, Microsoft, Zoho and your own servers, or you want AI, workflows and MCP built in.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Open source, GPL-3.0-or-later",
        source: "https://roundcube.net/about/",
      },
      selfHost: {
        text: "Self-hosted only: PHP 8.1+, a database and an existing IMAP/SMTP server",
        source: "https://roundcube.net/news/2026/05/10/roundcube-1.7.0-released",
      },
      providers: {
        text: "Any IMAP server the operator configures, with optional OAuth for Gmail and Microsoft; one account per login without plugins",
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
      aiAssistant: {
        text: "None in core; third-party plugins help write and summarize",
        source: "https://packagist.org/packages/cymdeveloppement/roundcube-ai",
      },
      modelChoice: {
        text: "Not in core; some plugins take any OpenAI-compatible endpoint",
        source: "https://packagist.org/packages/mazzz1y/roundcube-ai",
      },
      mcp: { text: "None", source: "https://plugins.roundcube.net/" },
      automation: {
        text: "Server-side Sieve filters through the bundled managesieve plugin",
        source: "https://github.com/roundcube/roundcubemail/tree/master/plugins/managesieve",
      },
      platforms: {
        text: "Web only, with a responsive skin for phones",
        source: "https://roundcube.net/about/",
      },
      pricing: {
        text: "Free; enterprise support from Nextcloud GmbH by quote",
        source: "https://roundcube.net/support/",
      },
    },
  },
  {
    slug: "gmail-gemini",
    name: "Gmail with Gemini",
    maker: "Google",
    summary:
      "Google's hosted email service with Gemini AI, through Google AI plans or Google Workspace.",
    description:
      "Metis Suite vs Gmail with Gemini: one open-source client for Gmail, Outlook, Zoho and IMAP with your own AI model, versus Google's own AI in Gmail.",
    answer:
      "Gmail with Gemini is Google's hosted mail with a Gemini side panel that summarizes, drafts, searches and, after you confirm, archives or labels mail; fuller Gemini features come with Google AI plans or Google Workspace. Metis Suite is an open-source client that works with your Gmail account alongside Outlook, Zoho Mail, IMAP, other calendars and file servers, and its AI runs on the model you choose. You keep Gmail as your provider either way.",
    pickThem: "Everything you use is in Google, and you are happy with Gemini as the only model.",
    pickUs:
      "You also use Outlook, Zoho, IMAP or your own servers, want to choose the AI model, or want to self-host the client.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://policies.google.com/terms",
      },
      selfHost: {
        text: "No, Google-hosted only",
        source: "https://workspace.google.com/intl/en/pricing.html?region=US",
      },
      providers: {
        text: "Gmail and Workspace accounts; the mobile apps add other IMAP accounts, while the web drops POP fetching and Gmailify",
        source: "https://support.google.com/mail/answer/16604719?hl=en",
      },
      calendar: {
        text: "Google Calendar in Gmail's side panel; Gemini can create events",
        source: "https://support.google.com/mail/answer/106237?hl=en&co=GENIE.Platform%3DDesktop",
      },
      files: {
        text: "No file browser in Gmail; Google Drive is a separate app",
        source: "https://support.google.com/mail/answer/106237?hl=en&co=GENIE.Platform%3DDesktop",
      },
      aiAssistant: {
        text: "Gemini side panel summarizes, drafts and searches, and archives, deletes or labels after you confirm",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      modelChoice: {
        text: "Google's Gemini models only",
        source: "https://support.google.com/mail/answer/14199860?hl=en&co=GENIE.Platform%3DDesktop",
      },
      mcp: {
        text: "Workspace MCP servers in Developer Preview, with a Google Cloud project",
        source: "https://developers.google.com/workspace/guides/configure-mcp-servers",
      },
      automation: {
        text: "Gmail filters; Workspace Studio agents for business customers",
        source: "https://support.google.com/mail/answer/6579?hl=en",
      },
      platforms: {
        text: "Web, Android, iPhone and iPad",
        source: "https://support.google.com/mail/answer/6078445?hl=en&co=GENIE.Platform%3DiOS",
      },
      pricing: {
        text: "Free Gmail includes AI summaries; more with Google AI plans from $4.99 a month or Workspace from $7 per user a month",
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
      "Outlook with Copilot is Microsoft's email and calendar app with Copilot for drafting, summarizing and triaging mail, included in Microsoft 365 consumer plans and sold to businesses as Copilot add-ons. New Outlook also adds Gmail and IMAP accounts. Metis Suite is open source and self-hostable, adds Zoho, CalDAV and file drives such as Google Drive, S3 and SFTP, runs its agent on the model you choose, and asks before every send or delete.",
    pickThem:
      "Your organization runs on Microsoft 365, and you want Copilot across Word, Excel and Teams as well as Outlook.",
    pickUs:
      "You want to self-host, choose the AI model, use Linux, or bring Google, Zoho and your own servers into the same suite.",
    checked: "2026-10-21",
    cells: {
      license: {
        text: "Proprietary",
        source: "https://www.microsoft.com/en-us/servicesagreement",
      },
      selfHost: {
        text: "No; Copilot runs in Microsoft's cloud, and new Outlook does not support on-premises Exchange",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/supported-account-types",
      },
      providers: {
        text: "Microsoft 365 and Outlook.com, plus Gmail, Yahoo, iCloud and other IMAP or POP accounts in new Outlook",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/supported-account-types",
      },
      calendar: {
        text: "Built-in Outlook calendar for Microsoft accounts",
        source:
          "https://support.microsoft.com/en-us/outlook/getstarted/feature-comparison-between-new-outlook-and-classic-outlook",
      },
      files: {
        text: "No file browser beyond attachments",
        source:
          "https://support.microsoft.com/en-us/office/use-files-to-find-attachments-in-your-mailbox-4b2cc98b-bd76-45ed-817c-fdb43e1f3c5b",
      },
      aiAssistant: {
        text: "Copilot archives, deletes, moves and categorizes mail, asking first only when more than five emails are affected",
        source:
          "https://support.microsoft.com/en-us/outlook/triage-email-with-microsoft-365-copilot-in-outlook",
      },
      modelChoice: {
        text: "Microsoft-provided OpenAI and Anthropic models; no own key or local model",
        source:
          "https://learn.microsoft.com/en-us/microsoft-365/copilot/connect-to-ai-subprocessor",
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
        text: "Windows, Mac, web, iOS and Android; Linux through the web only",
        source:
          "https://support.microsoft.com/en-us/outlook/triage-email-with-microsoft-365-copilot-in-outlook",
      },
      pricing: {
        text: "Microsoft 365 Personal $9.99 a month; Copilot Business $21 and Microsoft 365 Copilot $30 per user a month, yearly",
        source:
          "https://www.microsoft.com/en-us/microsoft-365/buy/compare-all-microsoft-365-products",
      },
    },
  },
];
