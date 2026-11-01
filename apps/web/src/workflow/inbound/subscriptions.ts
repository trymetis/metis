import "server-only";
import { calendar as calendarApi } from "@googleapis/calendar";
import { drive as driveApi } from "@googleapis/drive";
import { auth } from "@googleapis/gmail";
import { Client } from "@microsoft/microsoft-graph-client";

import { getInstanceConfig } from "@/config/runtime";
import { oauthToken } from "@/connections/types";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { errorStatus } from "@/lib/token-map";

import { resolvePrincipal, resourceAuth } from "../authorization";
import { errorCode } from "../diagnostics";
import type { EndpointKind } from "../schema";
import type { ResourceKind } from "../steps/types";
import {
  armedTriggersOfKind,
  deleteEndpoint,
  type DueTrigger,
  type EndpointRow,
  endpointsOf,
  expiringEndpoints,
  strandedEndpoints,
  touchEndpoint,
  triggerById,
  upsertEndpoint,
} from "../store";
import { endpointUrl, newSecret } from "./endpoints";

const RENEW_BEFORE_MS = 24 * 3_600_000;
const RENEWALS_PER_TICK = 10;
const STOPS_PER_TICK = 20;
const GRAPH_MAIL_MINUTES = 4_000;
const GRAPH_EVENTS_MINUTES = 4_000;
const GRAPH_DRIVE_MINUTES = 40_000;
const GOOGLE_CHANNEL_MS = 6 * 86_400_000;

const FEED_KINDS = [
  "trigger.mail.received",
  "trigger.mail.sent",
  "trigger.mail.starred",
  "trigger.calendar.created",
  "trigger.calendar.updated",
  "trigger.calendar.cancelled",
  "trigger.calendar.invited",
  "trigger.calendar.rsvp",
  "trigger.calendar.starting",
  "trigger.calendar.ended",
  "trigger.drive.added",
  "trigger.drive.changed",
];

function google(token: string) {
  const client = new auth.OAuth2();
  client.setCredentials({ access_token: token });
  return client;
}

function graph(token: string): Client {
  return Client.init({ authProvider: (done) => done(null, token) });
}

function resourceOf(
  due: DueTrigger,
): { kind: ResourceKind; id: string; param: Record<string, string> } | null {
  const node = due.graph.nodes.find((n) => n.id === due.trigger.nodeId);
  if (!node) return null;
  const read = (name: string) => {
    const bound = node.params[name];
    return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
  };
  const param = { folder: read("folder"), calendarId: read("calendarId") };
  if (due.trigger.kind.startsWith("trigger.mail."))
    return { kind: "mailbox", id: read("mailbox"), param };
  if (due.trigger.kind.startsWith("trigger.calendar."))
    return { kind: "calendar", id: read("calendar"), param };
  return { kind: "drive", id: read("drive"), param };
}

const GRAPH_FOLDERS: Record<string, string> = {
  inbox: "inbox",
  sent: "sentitems",
  archive: "archive",
  trash: "deleteditems",
  spam: "junkemail",
  drafts: "drafts",
};

function graphResource(
  due: DueTrigger,
  kind: ResourceKind,
  folder: string,
): { resource: string; changeType: string; minutes: number } {
  if (kind === "mailbox") {
    const name =
      due.trigger.kind === "trigger.mail.sent"
        ? "sentitems"
        : (GRAPH_FOLDERS[folder || "inbox"] ?? "inbox");
    return {
      resource: `me/mailFolders('${name}')/messages`,
      changeType: due.trigger.kind === "trigger.mail.starred" ? "updated" : "created",
      minutes: GRAPH_MAIL_MINUTES,
    };
  }
  if (kind === "calendar")
    return {
      resource: "me/events",
      changeType: "created,updated,deleted",
      minutes: GRAPH_EVENTS_MINUTES,
    };
  return { resource: "me/drive/root", changeType: "updated", minutes: GRAPH_DRIVE_MINUTES };
}

async function renewGraph(
  client: Client,
  subscriptionId: string,
  body: { expirationDateTime: string; notificationUrl: string },
): Promise<boolean> {
  try {
    await client.api(`/subscriptions/${subscriptionId}`).patch(body);
    return true;
  } catch (err) {
    if (errorStatus(err) === 404) return false;
    throw err;
  }
}

async function subscribe(due: DueTrigger, existing: EndpointRow | undefined): Promise<boolean> {
  const principal = await resolvePrincipal(due.definition);
  if (!principal.ok) return false;
  const resource = resourceOf(due);
  if (!resource?.id) return false;
  const access = await resourceAuth({
    definition: due.definition,
    principal: principal.value,
    ...resource,
  });
  if (!access.ok) return false;
  const { provider, email } = access.value;
  if (provider !== "google" && provider !== "microsoft") return false;
  const token = oauthToken(access.value.auth);

  if (provider === "microsoft") {
    const client = graph(token);
    const target = graphResource(due, resource.kind, resource.param.folder ?? "");
    const expires = new Date(Date.now() + target.minutes * 60_000);
    const secret = existing?.secret ?? newSecret();
    const endpoint =
      existing ??
      (await upsertEndpoint({
        workflowId: due.definition.id,
        triggerId: due.trigger.id,
        kind: "graph",
        secret,
      }));
    if (
      existing?.externalId &&
      (await renewGraph(client, existing.externalId, {
        expirationDateTime: expires.toISOString(),
        notificationUrl: endpointUrl(endpoint.id),
      }))
    ) {
      await upsertEndpoint({
        workflowId: due.definition.id,
        triggerId: due.trigger.id,
        kind: "graph",
        secret,
        expiresAt: expires,
      });
      return true;
    }
    const created: unknown = await client.api("/subscriptions").post({
      changeType: target.changeType,
      notificationUrl: endpointUrl(endpoint.id),
      resource: target.resource,
      expirationDateTime: expires.toISOString(),
      clientState: endpoint.secret,
    });
    const id =
      created && typeof created === "object" && "id" in created ? String(created.id) : null;
    await upsertEndpoint({
      workflowId: due.definition.id,
      triggerId: due.trigger.id,
      kind: "graph",
      secret: endpoint.secret,
      externalId: id,
      resourceId: email,
      expiresAt: expires,
    });
    return true;
  }

  if (resource.kind === "mailbox") return false;

  const kind: EndpointKind = "google-channel";
  const secret = existing?.secret ?? newSecret();
  const endpoint =
    existing ??
    (await upsertEndpoint({
      workflowId: due.definition.id,
      triggerId: due.trigger.id,
      kind,
      secret,
    }));
  const expires = new Date(Date.now() + GOOGLE_CHANNEL_MS);
  const channelId = crypto.randomUUID();
  const body = {
    id: channelId,
    type: "web_hook",
    address: endpointUrl(endpoint.id),
    token: endpoint.secret,
    expiration: String(expires.getTime()),
  };
  if (resource.kind === "calendar") {
    const watched = await calendarApi({ version: "v3", auth: google(token) }).events.watch({
      calendarId: resource.param.calendarId || "primary",
      requestBody: body,
    });
    await upsertEndpoint({
      workflowId: due.definition.id,
      triggerId: due.trigger.id,
      kind,
      secret: endpoint.secret,
      externalId: `${channelId}|${watched.data.resourceId ?? ""}`,
      expiresAt: expires,
    });
    return true;
  }
  const client = driveApi({ version: "v3", auth: google(token) });
  const start = await client.changes.getStartPageToken({});
  const watched = await client.changes.watch({
    pageToken: start.data.startPageToken ?? "1",
    requestBody: body,
  });
  await upsertEndpoint({
    workflowId: due.definition.id,
    triggerId: due.trigger.id,
    kind,
    secret: endpoint.secret,
    externalId: `${channelId}|${watched.data.resourceId ?? ""}`,
    expiresAt: expires,
  });
  return true;
}

async function unsubscribe(endpoint: EndpointRow, due: DueTrigger | null): Promise<void> {
  try {
    if (due && endpoint.externalId) {
      const principal = await resolvePrincipal(due.definition);
      const resource = resourceOf(due);
      if (principal.ok && resource?.id) {
        const access = await resourceAuth({
          definition: due.definition,
          principal: principal.value,
          ...resource,
        });
        if (access.ok) {
          const token = oauthToken(access.value.auth);
          if (endpoint.kind === "graph")
            await graph(token).api(`/subscriptions/${endpoint.externalId}`).delete();
          if (endpoint.kind === "google-channel") {
            const [id, resourceId] = endpoint.externalId.split("|");
            const requestBody = { id, resourceId };
            if (resource.kind === "drive") {
              await driveApi({ version: "v3", auth: google(token) }).channels.stop({ requestBody });
            } else {
              await calendarApi({ version: "v3", auth: google(token) }).channels.stop({
                requestBody,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(
      `[workflow] could not stop a push subscription endpoint=${endpoint.id} code=${errorCode(err)}`,
    );
  }
  await deleteEndpoint(endpoint.id);
}

export async function renewEndpoints(now: Date): Promise<void> {
  try {
    for (const endpoint of await strandedEndpoints(STOPS_PER_TICK)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each subscription is stopped at its provider one at a time
      await unsubscribe(endpoint, await triggerById(endpoint.triggerId));
    }
  } catch (err) {
    console.error(`[workflow] stopping push subscriptions failed code=${errorCode(err)}`);
  }
  if (!getInstanceConfig().workflowRunner.publicUrl) {
    try {
      for (const endpoint of await expiringEndpoints(
        new Date(8_640_000_000_000_000),
        STOPS_PER_TICK,
      )) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- without a public URL every push subscription is stopped, one at a time
        await unsubscribe(endpoint, await triggerById(endpoint.triggerId));
      }
    } catch (err) {
      console.error(`[workflow] stopping push subscriptions failed code=${errorCode(err)}`);
    }
    return;
  }
  try {
    const armed = await armedTriggersOfKind({ kinds: FEED_KINDS });
    const endpoints = await endpointsOf([...new Set(armed.map((due) => due.definition.id))]);
    const push = endpoints.filter((endpoint) => endpoint.kind !== "webhook");
    let budget = RENEWALS_PER_TICK;
    for (const due of armed) {
      if (budget <= 0) break;
      const existing = push.find((endpoint) => endpoint.triggerId === due.trigger.id);
      if (existing?.expiresAt && existing.expiresAt.getTime() - now.getTime() > RENEW_BEFORE_MS)
        continue;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- renewals call providers one at a time, bounded per tick
        if (await subscribe(due, existing)) budget -= 1;
      } catch (err) {
        if (existing) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one endpoint row per failed renewal
          await touchEndpoint(existing.id, { lastError: sanitizeError(err) });
        }
        console.warn(
          `[workflow] push subscription failed trigger=${due.trigger.id} code=${errorCode(err)}`,
        );
      }
    }
  } catch (err) {
    console.error(`[workflow] push renewal failed code=${errorCode(err)}`);
  }
}
