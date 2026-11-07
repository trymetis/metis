import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { WorkspaceGate } from "@/components/workspace-gate";
import { orpc } from "@/lib/orpc.server";
import { aiEnabled as instanceAiEnabled } from "@/services/llm";
import { getWorkspacePolicy } from "@/workspace";
import { getWorkspaceGateData } from "@/workspace/gate";
import { onboardingPath } from "@/workspace/path";
import { aiEnabled, workspaceAllowsAi } from "@/workspace/policy";

import { AssistantShell } from "./_components/assistant-shell";
import { AssistantUnavailable } from "./_components/assistant-unavailable";

export const metadata: Metadata = { title: "Assistant" };

const emails = (rows: { email: string; policy: { ai: boolean } }[]) =>
  rows.filter(aiEnabled).map((r) => r.email);

export default async function AssistantLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/assistant">) {
  const { slug } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.workspaceId || !appUser.workspaceRole) redirect("/");

  const scope = { workspaceSlug: slug };
  const [{ mailboxes }, { calendars }, { drives }, { addressBooks }] = await Promise.all([
    orpc.workspaceMailboxes.list(scope),
    orpc.workspaceCalendars.list(scope),
    orpc.workspaceDrives.list(scope),
    orpc.workspaceAddressBooks.list(scope),
  ]);

  if (mailboxes.length + calendars.length + drives.length + addressBooks.length === 0) {
    const gate = await getWorkspaceGateData(appUser.userId, appUser.workspaceId, "assistant");
    if (!gate.showChooser) redirect(onboardingPath(slug));
    return (
      <WorkspaceGate
        destination="assistant"
        currentName={gate.currentName}
        currentSlug={gate.currentSlug}
        workspaces={gate.workspaces}
      />
    );
  }

  if (!instanceAiEnabled()) notFound();

  const workspacePolicy = await getWorkspacePolicy(appUser.workspaceId);
  if (!workspacePolicy) notFound();
  if (!workspaceAllowsAi(workspacePolicy)) {
    return (
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <AssistantUnavailable workspaceSlug={slug} />
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 flex-1 overflow-hidden">
      <AssistantShell
        mailboxes={emails(mailboxes)}
        calendars={emails(calendars)}
        drives={emails(drives)}
        addressBooks={emails(addressBooks)}
      >
        {children}
      </AssistantShell>
    </div>
  );
}
