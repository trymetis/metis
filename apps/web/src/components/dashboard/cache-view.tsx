"use client";

import { rpc } from "@/lib/orpc";

import { ConfigForm } from "./config-form";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Note, Sections, ToneBadge } from "./system-ui";

const load = rpc.dashboard.system.cache.queryOptions();

export function CacheView() {
  const [cache, reload] = useSystemResource(load);
  if (!cache) return <Loading />;

  const memory = cache.driver === "memory";

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "cache" }}
        hint="Writes, reads back and deletes a throwaway key."
      />

      <ConfigForm
        config={cache.config}
        onSaved={reload}
        cards={{
          cache: {
            hint: "Fixed at deploy: Better Auth's storage and every rate-limit counter are bound to it when the process starts.",
            badge: (
              <ToneBadge tone={memory ? "neutral" : "ok"}>
                {memory ? "In process" : "Shared"}
              </ToneBadge>
            ),
            children: memory && (
              <Note>
                Each process keeps its own counters and tokens, and loses them on restart. Use redis
                or upstash when running more than one process.
              </Note>
            ),
          },
        }}
      />
    </Sections>
  );
}
