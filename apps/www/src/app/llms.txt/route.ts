import { PAGES } from "@/content/pages";
import { FAQ_ITEMS } from "@/lib/faq";
import {
  absoluteUrl,
  DOCS_URL,
  GITHUB_URL,
  ORG_NAME,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/site";

export const dynamic = "force-static";

const DOCS: [string, string][] = [
  ["/guide", "User guide: mail, calendar, drive, assistant, workflows and workspaces"],
  ["/guide/reference/supported-providers", "What works with each provider"],
  [
    "/guide/assistant/approve-or-decline-actions",
    "What the AI agent does on its own and what needs approval",
  ],
  ["/guide/assistant/connect-an-ai-client", "Connect Claude, Cursor, Codex or VS Code over MCP"],
  [
    "/guide/assistant/what-an-mcp-client-can-do",
    "Tools an MCP client gets, and which are off by default",
  ],
  ["/guide/workflows/triggers", "Workflow triggers"],
  [
    "/guide/apps/download",
    "Download the desktop app for macOS, Windows and Linux, or the Android app",
  ],
  ["/self-hosting", "Self-hosting guide"],
  ["/self-hosting/install/requirements", "Server requirements"],
  ["/self-hosting/install/install-with-docker-compose", "Install with Docker Compose"],
  ["/self-hosting/configure/sign-in-providers", "Set up Google, Microsoft and Zoho sign-in"],
  ["/self-hosting/configure/server-lists", "Define IMAP, CalDAV, S3, WebDAV, FTP and SFTP servers"],
  ["/self-hosting/configure/ai-models", "Bring your own AI model"],
  ["/changelog", "Changelog: every server, desktop and mobile release"],
];

export function GET() {
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is built by ${ORG_NAME} and licensed under AGPL-3.0-or-later. It is a client: mail, calendars and files stay with Google, Microsoft, Zoho or your own servers. Source code: ${GITHUB_URL}`,
    "",
    "## Pages",
    "",
    ...Object.entries(PAGES).map(
      ([path, page]) => `- [${page.label}](${absoluteUrl(path)}): ${page.description}`,
    ),
    "",
    "## Docs",
    "",
    ...DOCS.map(([path, text]) => `- [${text}](${DOCS_URL}${path})`),
    "",
    "## FAQ",
    "",
    ...FAQ_ITEMS.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
