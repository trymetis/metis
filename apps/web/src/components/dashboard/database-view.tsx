"use client";

import { rpc } from "@/lib/orpc";

import { HealthCheck, Loading, useSystemData } from "./system-client";
import { Mono, Note, Row, Rows, Section, Sections, ToneBadge } from "./system-ui";
import { WithVendor } from "./vendor-mark";

const load = rpc.dashboard.system.database.queryOptions();

export function DatabaseView() {
  const database = useSystemData(load);
  if (!database) return <Loading />;

  const local = database.driver === "local";

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "database" }}
        hint="Runs select 1 on both databases."
      />

      <Section
        title="Driver"
        hint="Fixed at deploy: the app needs it to reach anything else."
        badge={
          <ToneBadge tone={local ? "warning" : "neutral"}>
            {local ? "Dev only" : database.driver}
          </ToneBadge>
        }
      >
        <Rows>
          <Row label="Driver">
            <WithVendor vendor={database.vendor}>
              <Mono>{database.driver}</Mono>
            </WithVendor>
          </Row>
          <Row label="App database">
            <Mono>{database.app}</Mono>
          </Row>
          <Row label="Mastra database">
            <Mono>{database.mastra}</Mono>
          </Row>
        </Rows>
        {local && (
          <Note>The local driver has no concurrency protection and must never be deployed.</Note>
        )}
      </Section>
    </Sections>
  );
}
