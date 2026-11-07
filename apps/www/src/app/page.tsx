import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { SiteJsonLd } from "@/components/json-ld";
import { Faq } from "@/components/site/faq";
import { RunIt } from "@/components/site/run-it";
import { StartActions } from "@/components/site/start-actions";
import { Together } from "@/components/site/together";
import { Trust } from "@/components/site/trust";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/");

const SCREEN: [number, number, number] = [0, 1.04, -1.3];

const POSES: Pose[] = [
  { yaw: -22, pitch: 17, dist: 12.6, target: [0, 0.9, -0.35] },
  { yaw: 0, pitch: 17, dist: 12.4, target: SCREEN },
  { yaw: 14, pitch: 16, dist: 12.6, target: SCREEN },
  { yaw: -14, pitch: 16, dist: 12.6, target: SCREEN },
  { yaw: -4, pitch: 18, dist: 12.4, target: SCREEN },
  { yaw: 7, pitch: 20, dist: 12.4, target: SCREEN },
  { yaw: -8, pitch: 14, dist: 12.4, target: SCREEN },
  { yaw: 24, pitch: 24, dist: 12.6, target: [0, 0.95, -0.6] },
];

export default function Home() {
  return (
    <>
      <SiteJsonLd />
      <Exhibit
        model="laptop"
        headline="Metis Suite: the open-source email, calendar, drive and contacts client for Gmail, Outlook, Zoho and your own servers, with an AI agent, workflows and MCP"
        poses={POSES}
        actions={<StartActions />}
        plates={[
          {
            label: "Metis Suite",
            title: (
              <>
                Every account you work in, <em>one suite.</em>
              </>
            ),
            text: "Mail, calendars, drives and contacts from Google, Microsoft, Zoho and your own servers, joined in one place. An agent, workflows and MCP work across all of it, and the agent asks before anything is sent or deleted.",
          },
          {
            label: "Mail",
            title: (
              <>
                Every inbox, <em>one list.</em>
              </>
            ),
            text: "Gmail, Outlook, Zoho Mail and IMAP together, with summaries, sorting and tracker blocking built in.",
            link: { href: "/mail", label: "See Mail" },
          },
          {
            label: "Calendar",
            title: (
              <>
                Every calendar, <em>one week.</em>
              </>
            ),
            text: "Google Calendar, Outlook, Zoho Calendar and CalDAV side by side, with real editing and RSVPs.",
            link: { href: "/calendar", label: "See Calendar" },
          },
          {
            label: "Drive",
            title: (
              <>
                Every drive, <em>one explorer.</em>
              </>
            ),
            text: "Google Drive, OneDrive, S3, WebDAV, FTP and SFTP, with previews in the browser and attachments saved straight from mail.",
            link: { href: "/drive", label: "See Drive" },
          },
          {
            label: "Contacts",
            title: (
              <>
                Every address book, <em>one list.</em>
              </>
            ),
            text: "Google, Outlook, Zoho and CardDAV contacts together, saved from any email in one click.",
            link: { href: "/contacts", label: "See Contacts" },
          },
          {
            label: "Agent",
            title: (
              <>
                One agent <em>across all of it.</em>
              </>
            ),
            text: "It searches mail, calendars, drives and contacts in one conversation, drafts replies and finds the free hour, then waits for your approval before anything is sent or deleted.",
            link: { href: "/agent", label: "See the agent" },
          },
          {
            label: "Workflows",
            title: (
              <>
                Rules that <em>run on their own.</em>
              </>
            ),
            text: "When mail arrives, on a schedule or before you send: label, archive, star, mute or Bcc, with an AI question where a plain rule is not enough.",
            link: { href: "/workflows", label: "See Workflows" },
          },
          {
            label: "MCP",
            title: (
              <>
                The suite, <em>in your other tools.</em>
              </>
            ),
            text: "Claude, Cursor, Codex and VS Code get the same tools as the agent, limited to the workspaces and tools you approve.",
            link: { href: "/mcp", label: "See MCP" },
          },
        ]}
      />
      <Together />
      <Trust />
      <RunIt />
      <Faq />
    </>
  );
}
