"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { config } from "@/config";
import {
  addConnectionResource,
  type ConnectionResource,
  getOAuthDriver,
  upsertConnection,
} from "@/connections";
import { connectReturnPath, readConnectRequest } from "@/connections/callback";
import { connectionsCallbackUrl, nonceCookieName } from "@/connections/oauth-state";
import { route } from "@/lib/route";
import { getWorkspaceBySlug } from "@/workspace";
import { mailPath, workspaceSettingsPath } from "@/workspace/path";

export interface ConfirmResult {
  error: string | null;
}

const APP_ORIGIN = new URL(config.auth.url).origin;
const ERROR_MAX = 200;

function landingPath(resource: ConnectionResource, workspaceSlug: string, slug: string): string {
  switch (resource) {
    case "mailbox":
      return mailPath(workspaceSlug, slug, "inbox");
    case "calendar":
      return workspaceSettingsPath(workspaceSlug, "calendars");
    case "drive":
      return workspaceSettingsPath(workspaceSlug, "drives");
    case "addressbook":
      return workspaceSettingsPath(workspaceSlug, "contacts");
    default:
      return resource satisfies never;
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function confirmConnection(
  _previous: ConfirmResult,
  form: FormData,
): Promise<ConfirmResult> {
  const requestHeaders = await headers();
  if (requestHeaders.get("origin") !== APP_ORIGIN) {
    return { error: "This request did not come from this page. Connect the account again." };
  }

  const request = await readConnectRequest(
    text(form.get("provider")),
    new URLSearchParams(text(form.get("query"))),
    requestHeaders,
  );
  if (!request.ok) return { error: request.error };

  const { provider, state, userId, code, native } = request;
  const cookieStore = await cookies();

  if (text(form.get("intent")) !== "connect") {
    cookieStore.delete(nonceCookieName(state.nonce));
    console.log(
      `[connections-callback] ${provider} ${state.resource} cancelled for user ${userId}`,
    );
    redirect(route(connectReturnPath(state.callbackURL, native)));
  }

  const slug = text(form.get("workspace"));
  const target = slug ? await getWorkspaceBySlug(userId, slug) : null;
  if (slug && !target) return { error: "Pick a workspace you belong to." };

  let dest = state.callbackURL;
  let mismatch: string | null = null;
  try {
    const driver = getOAuthDriver(provider);
    const token = await driver.exchangeCode({
      code,
      redirectUri: connectionsCallbackUrl(provider),
      query: new URLSearchParams(text(form.get("query"))),
      resources: state.resources,
    });
    const profile = await driver.getProfile(token);
    const account = await upsertConnection({ userId, provider, profile, token });
    console.log(
      `[connections-callback] connected ${provider} ${state.resource} for user ${userId} → ${account.connectionId}`,
    );

    if (state.expect && state.expect.accountId !== profile.providerAccountId) {
      mismatch = `Connected ${profile.email}. You started from ${state.expect.email}, so this is a separate account.`;
    }

    const added = await addConnectionResource({
      account,
      resource: state.resource,
      workspaceId: target?.id ?? null,
    });
    if (target && added.slug) dest = landingPath(state.resource, target.slug, added.slug);
  } catch (err) {
    cookieStore.delete(nonceCookieName(state.nonce));
    const message = err instanceof Error ? err.message : "Connection failed";
    console.error("[connections-callback] error:", message);
    return { error: `${message.slice(0, ERROR_MAX)} Connect the account again.` };
  }

  cookieStore.delete(nonceCookieName(state.nonce));
  const destination = new URL(dest, config.auth.url);
  if (mismatch) destination.searchParams.set("warning", mismatch);
  redirect(route(connectReturnPath(`${destination.pathname}${destination.search}`, native)));
}
