"use client";

import type { ConnectionProvider } from "@/connections/types";
import { rpc } from "@/lib/orpc";
import type { DashboardSystemProvider } from "@/server/schema";

import { type ConfigCard, ConfigForm } from "./config-form";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Count, Mono, Note, Row, Rows, Section, Sections, ToneBadge } from "./system-ui";

type Connections = DashboardSystemProvider["connections"];

function ConnectionBadges({ connections }: { connections: Connections }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Count value={connections.active} singular="connection" plural="connections" />
      {connections.quarantined > 0 && (
        <ToneBadge tone="warning">{connections.quarantined} quarantined</ToneBadge>
      )}
    </span>
  );
}

export function ProviderView({ provider }: { provider: ConnectionProvider }) {
  const load = rpc.dashboard.system.provider.queryOptions({ input: { provider } });
  const [data, reload] = useSystemResource(load);
  if (!data) return <Loading />;

  const quarantinedOnly = !data.configured && data.connections.quarantined > 0;
  const section = data.config.sections[0]?.section;
  const card: ConfigCard = data.oauth
    ? {
        title: "OAuth client",
        hint: "The provider app users consent to.",
        badge: <ConnectionBadges connections={data.connections} />,
        children: (
          <div className="border-t border-border">
            <Rows>
              <Row label="Redirect URI">
                <Mono>{data.oauth.redirectUri}</Mono>
              </Row>
            </Rows>
            <Note>Register the redirect URI in the provider's console exactly as shown.</Note>
          </div>
        ),
      }
    : {
        hint: "The servers users can connect to. Users bring only their own login.",
        badge: <ConnectionBadges connections={data.connections} />,
        renderEntryBadge: (values) => {
          const entry = data.entries.find((item) => item.name === values?.name);
          return entry ? <ConnectionBadges connections={entry.connections} /> : null;
        },
      };

  return (
    <Sections>
      {data.configured ? (
        <HealthCheck
          input={{ kind: "provider", provider }}
          hint={
            data.oauth
              ? "Sends a deliberately invalid code to the token endpoint: a wrong client id or secret is rejected differently."
              : "Runs the same probes as preflight against every entry, without logging in as any user."
          }
        />
      ) : (
        <Section
          title="Not configured"
          description="Users cannot connect accounts through this provider."
          badge={<ToneBadge tone="off">Off</ToneBadge>}
        >
          <p className="text-[13px] text-muted-foreground">
            Fill in the configuration below and save to turn it on.
          </p>
        </Section>
      )}

      {quarantinedOnly && (
        <Section
          title="Quarantined connections"
          hint="Grants made while this provider was configured."
          badge={<ConnectionBadges connections={data.connections} />}
        >
          <p className="text-[13px] text-muted-foreground">
            They stay hidden from every workspace until the provider is configured again, and can be
            deleted from the owners' account pages.
          </p>
        </Section>
      )}

      {section && <ConfigForm config={data.config} onSaved={reload} cards={{ [section]: card }} />}
    </Sections>
  );
}
