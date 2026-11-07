import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { Button } from "@/components/site/button";
import { Compare } from "@/components/site/compare";
import { FeatureArea } from "@/components/site/feature-area";
import { InstallBlock } from "@/components/site/install-block";
import { pageMetadata } from "@/lib/metadata";
import { GITHUB_URL } from "@/lib/site";

export const metadata = pageMetadata("/self-host");

const POSES: Pose[] = [
  { yaw: -28, pitch: 14, dist: 10.5, target: [0, 1.0, 0] },
  { yaw: -4, pitch: 8, dist: 8.4, target: [0, 1.05, 0.4] },
  { yaw: 12, pitch: 10, dist: 7.2, target: [-0.2, 1.45, 0.6] },
  { yaw: 22, pitch: 12, dist: 8.2, target: [0.1, 1.25, 0.5] },
];

export default function SelfHostPage() {
  return (
    <>
      <PageJsonLd path="/self-host" />
      <Exhibit
        model="server"
        headline="Self-host Metis Suite, the open-source email, calendar, drive and contacts client, with Docker Compose"
        poses={POSES}
        actions={
          <>
            <Button href="#install" kind="internal">
              Install it
            </Button>
            <Button href={GITHUB_URL} tone="ghost" kind="external">
              Read the source
            </Button>
          </>
        }
        plates={[
          {
            label: "Self-host",
            title: (
              <>
                Your server. <em>Your keys.</em>
              </>
            ),
            text: "Run the whole suite on hardware you own with one script. AGPL-3.0, every tool included, the agent too.",
          },
          {
            label: "The stack",
            title: (
              <>
                Four containers, <em>one machine.</em>
              </>
            ),
            text: "Caddy for HTTPS, the app, a libSQL database and an updater that keeps it current.",
            chips: [{ label: "Caddy" }, { label: "App" }, { label: "sqld" }, { label: "Updater" }],
          },
          {
            label: "Your domain",
            title: (
              <>
                Point a domain. <em>Caddy does the rest.</em>
              </>
            ),
            text: "Run one command with your host name and the certificate arrives on the first request.",
          },
          {
            label: "Updates",
            title: (
              <>
                Updates that <em>roll back.</em>
              </>
            ),
            text: "Pick a release in the owner dashboard. The app switches only once the new release answers, and a failed upgrade puts the previous one back.",
          },
        ]}
      />
      <Compare />
      <div id="install" />
      <InstallBlock />
      <FeatureArea area="selfhost" link={false} />
    </>
  );
}
