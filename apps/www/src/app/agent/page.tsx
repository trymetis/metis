import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/agent");

const POSES: Pose[] = [
  { yaw: -22, pitch: 22, dist: 10, target: [0, 0.95, -0.15] },
  { yaw: -6, pitch: 16, dist: 6.6, target: [0, 1.3, -0.5] },
  { yaw: 10, pitch: 18, dist: 6.8, target: [-0.1, 1.25, -0.45] },
  { yaw: -14, pitch: 24, dist: 9.4, target: [0, 1.0, -0.2] },
];

export default function AgentPage() {
  return (
    <>
      <PageJsonLd path="/agent" />
      <Exhibit
        model="typewriter"
        headline="An AI agent for email, calendars and drives that asks before it sends or deletes"
        poses={POSES}
        plates={[
          {
            label: "Agent",
            title: (
              <>
                One agent <em>across the suite.</em>
              </>
            ),
            text: "It searches, reads and drafts across mail, calendar and drive in one conversation. Anything that sends or deletes waits for you.",
          },
          {
            label: "Steps",
            title: (
              <>
                Every step, <em>written down.</em>
              </>
            ),
            text: "Each search, read and lookup shows up as it happens, with what it looked at.",
          },
          {
            label: "Approval",
            title: (
              <>
                Your approval, <em>not its guess.</em>
              </>
            ),
            text: "Sending a reply, saving a file or deleting an event stops at an approval. Nothing runs until you say so.",
          },
          {
            label: "Your model",
            title: (
              <>
                Included, <em>or your own.</em>
              </>
            ),
            text: "Metis Cloud includes AI every month, so the agent works from the first day. Or add a key for any model you run or pay for, on Metis Cloud or your own server.",
          },
        ]}
      />
      <FeatureArea area="agent" link={false} />
    </>
  );
}
