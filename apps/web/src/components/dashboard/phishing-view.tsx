"use client";

import { rpc } from "@/lib/orpc";

import { ConfigForm } from "./config-form";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Note, Sections, ToneBadge } from "./system-ui";

const load = rpc.dashboard.system.phishing.queryOptions();

export function PhishingView() {
  const [phishing, reload] = useSystemResource(load);
  if (!phishing) return <Loading />;

  const enabled = phishing.driver !== "disabled";

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "phishing" }}
        hint="Calls the backend's /health endpoint."
      />

      <ConfigForm
        config={phishing.config}
        onSaved={reload}
        cards={{
          phishingDetection: {
            hint: "The service that classifies a message's raw MIME.",
            badge: <ToneBadge tone={enabled ? "ok" : "off"}>{enabled ? "On" : "Off"}</ToneBadge>,
            children: !enabled && (
              <Note>The badge, the agent tool and the MCP tool are hidden.</Note>
            ),
          },
        }}
      />
    </Sections>
  );
}
