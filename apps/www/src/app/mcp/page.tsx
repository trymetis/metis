import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { StartActions } from "@/components/site/start-actions";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/mcp");

const POSES: Pose[] = [
  { yaw: -24, pitch: 26, dist: 9.2, target: [0, 0.3, 0.9] },
  { yaw: 0, pitch: 32, dist: 7.6, target: [0, 0.25, 1.0] },
  { yaw: 20, pitch: 22, dist: 6.2, target: [0.7, 0.35, 0.95] },
  { yaw: -12, pitch: 30, dist: 7.8, target: [0.2, 0.25, 1.1] },
];

export default function McpPage() {
  return (
    <>
      <PageJsonLd path="/mcp" />
      <Exhibit
        model="patchboard"
        headline="An MCP server for your Gmail, Outlook, calendars, drives and contacts"
        poses={POSES}
        actions={<StartActions />}
        plates={[
          {
            label: "MCP",
            title: (
              <>
                The suite, <em>inside your other tools.</em>
              </>
            ),
            text: "Connect any MCP client to Metis and it gets the same mail, calendar, drive and contacts tools as the agent, limited to the workspaces and tools you approve.",
          },
          {
            label: "Clients",
            title: (
              <>
                Ask from <em>where you work.</em>
              </>
            ),
            text: "Find the contract a client sent, sum up this week's meetings or tidy a shared folder without leaving Claude, Cursor or VS Code.",
            chips: [
              { label: "Claude" },
              { label: "Cursor" },
              { label: "Codex" },
              { label: "VS Code" },
              { label: "Any client" },
            ],
          },
          {
            label: "Consent",
            title: (
              <>
                Nothing connects <em>without you.</em>
              </>
            ),
            text: "A new client asks first. Choose the workspaces and tools it gets, then confirm with your authenticator.",
          },
          {
            label: "Control",
            title: (
              <>
                Unplug <em>at any time.</em>
              </>
            ),
            text: "Pause a client and it stops at once. Revoke its sign-ins or remove it whenever you want.",
          },
        ]}
      />
      <FeatureArea area="mcp" link={false} />
    </>
  );
}
