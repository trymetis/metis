import { Button } from "@metis/ui/components/button";
import { BookUser, CalendarDays, HardDrive, Inbox } from "lucide-react";
import Link from "next/link";

import { type ConnectionResource, connectServers } from "@/connections";
import { workspaceSettingsPath } from "@/workspace/path";

import { providerNames, serverProviders, serversForResource } from "./provider-meta";

const COPY = {
  mailbox: {
    Icon: Inbox,
    noun: "mailbox",
    title: "No mailbox in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} mailbox, or pick one you have already connected on your account.`,
    cta: "Go to mailbox settings",
    page: "mailboxes",
    label: "mail",
  },
  calendar: {
    Icon: CalendarDays,
    noun: "calendar",
    title: "No calendar in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} account, then choose which of its calendars this workspace can see.`,
    cta: "Go to calendar settings",
    page: "calendars",
    label: "account",
  },
  drive: {
    Icon: HardDrive,
    noun: "drive",
    title: "No drive in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} account to browse its files here, or pick one you have already connected.`,
    cta: "Go to drive settings",
    page: "drives",
    label: "account",
  },
  addressbook: {
    Icon: BookUser,
    noun: "address book",
    title: "No address book in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} account, then choose which of its address books this workspace can see.`,
    cta: "Go to contacts settings",
    page: "contacts",
    label: "account",
  },
} as const satisfies Record<ConnectionResource, unknown>;

export function AttachResourceCard({
  resource,
  workspaceSlug,
}: {
  resource: ConnectionResource;
  workspaceSlug: string;
}) {
  const { Icon, noun, title, body, cta, page, label } = COPY[resource];
  const providers = providerNames(
    serverProviders(serversForResource(connectServers(), resource)),
    label,
  );

  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft">
          <Icon className="h-7 w-7 text-brand-text" strokeWidth={1.6} />
        </div>

        <h1 className="mt-5 font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted-foreground">
          {providers
            ? body(providers)
            : `No ${noun} providers are set up yet. The instance owner adds them in the dashboard.`}
        </p>

        <Button
          className="mt-6"
          nativeButton={false}
          render={<Link href={workspaceSettingsPath(workspaceSlug, page)}>{cta}</Link>}
        />
      </div>
    </div>
  );
}
