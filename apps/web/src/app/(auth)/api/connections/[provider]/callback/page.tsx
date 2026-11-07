import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";

import { NativeCard } from "@/components/native-card";
import { type ConnectionResource, getDriver } from "@/connections";
import { readConnectRequest } from "@/connections/callback";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { route } from "@/lib/route";
import { listMyWorkspaces } from "@/workspace";

import { ConnectConfirm } from "./_components/connect-confirm";

export const dynamic = "force-dynamic";

const RESOURCE_NOUN: Record<ConnectionResource, string> = {
  mailbox: "mail",
  calendar: "calendars",
  drive: "files",
  addressbook: "contacts",
};

function Problem({ message, returnTo }: { message: string; returnTo: string | null }) {
  return (
    <NativeCard title="Nothing was connected" body={message}>
      {returnTo && (
        <Link
          href={route(returnTo)}
          className="text-sm font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
        >
          Go back
        </Link>
      )}
    </NativeCard>
  );
}

export default async function ConnectCallbackPage({
  params,
  searchParams,
}: PageProps<"/api/connections/[provider]/callback">) {
  const { provider } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }

  const request = await readConnectRequest(provider, query, await headers());
  if (!request.ok) return <Problem message={request.error} returnTo={request.returnTo} />;

  const [owner] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, request.userId))
    .limit(1);
  if (!owner) {
    return (
      <Problem
        message="The account that started this connection no longer exists."
        returnTo={null}
      />
    );
  }

  const workspaces = (await listMyWorkspaces(request.userId)).map((w) => ({
    slug: w.slug,
    name: w.name,
  }));
  const { attachWorkspaceSlug, attachPreselect } = request.state;
  const preselected =
    attachPreselect && workspaces.some((w) => w.slug === attachWorkspaceSlug)
      ? (attachWorkspaceSlug ?? null)
      : null;

  return (
    <ConnectConfirm
      provider={request.provider}
      query={query.toString()}
      label={getDriver(request.provider).label}
      resource={RESOURCE_NOUN[request.state.resource]}
      metisEmail={owner.email}
      workspaces={workspaces}
      preselected={preselected}
    />
  );
}
