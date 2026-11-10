"use client";

import { Badge } from "@metis/ui/components/badge";

import { rpc } from "@/lib/orpc";

import { ConfigForm } from "./config-form";
import { Loading, useSystemResource } from "./system-client";
import { Mono, Note, NotSet, Row, Rows, Section, Sections, ToneBadge, YesNo } from "./system-ui";

const load = rpc.dashboard.system.instance.queryOptions();

export function InstanceView() {
  const [instance, reload] = useSystemResource(load);
  if (!instance) return <Loading />;

  const { legal } = instance;
  const consent = legal.termsUrl !== null || legal.privacyUrl !== null;

  return (
    <Sections>
      <Section title="App" description="Where the instance is served from.">
        <Rows>
          <Row label="Public URL">
            <Mono>{instance.appUrl}</Mono>
          </Row>
          <Row label="Secure cookies">
            <YesNo value={instance.secureCookies} />
          </Row>
        </Rows>
      </Section>

      <Section
        title="Accounts"
        description="Who owns this dashboard, and the code that creates the owner account."
      >
        <Rows>
          <Row label="Setup code">
            {instance.setupCode === "live" ? (
              <ToneBadge tone="danger">Live</ToneBadge>
            ) : instance.setupCode === "spent" ? (
              <Badge variant="outline">Used</Badge>
            ) : (
              <NotSet />
            )}
          </Row>
          <Row label="Owner">
            <Mono>{instance.ownerEmail}</Mono>
          </Row>
        </Rows>
        {instance.setupCode === "live" && (
          <Note>
            No account has the owner address yet, so anyone with the setup code can create it at
            /setup.
          </Note>
        )}
        {instance.setupCode === "spent" && (
          <Note>
            The owner account exists, so the setup code no longer works. Keep it set if you may hand
            the instance to an address that has no account yet; that new owner claims it at /setup.
          </Note>
        )}
      </Section>

      <ConfigForm
        config={instance.config}
        onSaved={reload}
        cards={{
          signup: {
            description: "How accounts get created.",
            badge: instance.signupDisabled ? (
              <Badge variant="outline">Invite only</Badge>
            ) : (
              <ToneBadge tone="warning">Open</ToneBadge>
            ),
          },
          legal: {
            description: "What new accounts agree to at sign-up.",
            badge: (
              <ToneBadge tone={consent ? "ok" : "off"}>
                {consent ? `Version ${legal.version}` : "Off"}
              </ToneBadge>
            ),
          },
          relay: {
            description:
              "Limits for drives whose bytes pass through the server: WebDAV, FTP, SFTP and relay S3.",
          },
          imageProxy: {
            description:
              "Lets users load remote images in received mail through this server, which hides their device from the sender but not that the message was opened.",
            badge: (
              <ToneBadge tone={instance.imageProxy ? "ok" : "off"}>
                {instance.imageProxy ? "On" : "Off"}
              </ToneBadge>
            ),
          },
          mailCache: {
            description: "How long this instance keeps copies of message bodies it has shown.",
          },
          proxies: {
            description:
              "How this instance finds a visitor's address behind a load balancer or CDN. Workflow webhook IP allow lists use the Workflow runner's own list.",
          },
        }}
      />
    </Sections>
  );
}
