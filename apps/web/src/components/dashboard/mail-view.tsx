"use client";

import { rpc } from "@/lib/orpc";
import { NOOP_DISABLED_FLOWS } from "@/services/mailer/types";

import { ConfigForm } from "./config-form";
import { HealthCheck, Loading, useSystemResource } from "./system-client";
import { Note, Sections, ToneBadge } from "./system-ui";

const load = rpc.dashboard.system.mail.queryOptions();

export function MailView() {
  const [mailer, reload] = useSystemResource(load);
  if (!mailer) return <Loading />;

  const { driver } = mailer;
  const flows = NOOP_DISABLED_FLOWS.join(", ");

  return (
    <Sections>
      <HealthCheck
        input={{ kind: "driver", driver: "mail" }}
        hint="Logs in to the SMTP server, or checks the Resend API key. Sends nothing."
      />

      <ConfigForm
        config={mailer.config}
        onSaved={reload}
        cards={{
          mailer: {
            hint: "Sign-in links, sign-in alerts, verification, password resets and invites, and the From address on each.",
            badge:
              driver === "noop" ? (
                <ToneBadge tone="danger">Not delivered</ToneBadge>
              ) : driver === "log" ? (
                <ToneBadge tone="warning">Console only</ToneBadge>
              ) : (
                <ToneBadge tone="ok">Delivering</ToneBadge>
              ),
            children: (
              <>
                {driver === "noop" && <Note>Disabled flows: {flows}.</Note>}
                {driver === "log" && <Note>Written to the server console instead: {flows}.</Note>}
              </>
            ),
          },
        }}
      />
    </Sections>
  );
}
