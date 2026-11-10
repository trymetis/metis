"use client";

import { cn } from "@metis/ui/lib/utils";
import {
  BookUser,
  CalendarDays,
  HardDrive,
  History,
  Inbox,
  Signature,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ResponsiveAside } from "@/components/mobile-aside";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { workspaceSettingsPath } from "@/workspace/path";

export function SettingsSidebar() {
  const pathname = usePathname();
  const slug = useWorkspaceSlug();
  const { role } = useWorkspaceAccess();
  const canSeeActivity = role === "owner" || role === "admin";

  const nav = [
    {
      href: workspaceSettingsPath(slug, "general"),
      label: "General",
      icon: SlidersHorizontal,
    },
    {
      href: workspaceSettingsPath(slug, "members"),
      label: "Members",
      icon: Users,
    },
    {
      href: workspaceSettingsPath(slug, "mailboxes"),
      label: "Mailboxes",
      icon: Inbox,
    },
    {
      href: workspaceSettingsPath(slug, "signatures"),
      label: "Signatures",
      icon: Signature,
    },
    {
      href: workspaceSettingsPath(slug, "calendars"),
      label: "Calendars",
      icon: CalendarDays,
    },
    {
      href: workspaceSettingsPath(slug, "drives"),
      label: "Drives",
      icon: HardDrive,
    },
    {
      href: workspaceSettingsPath(slug, "contacts"),
      label: "Contacts",
      icon: BookUser,
    },
    ...(canSeeActivity
      ? [
          {
            href: workspaceSettingsPath(slug, "activity"),
            label: "Activity",
            icon: History,
          },
        ]
      : []),
  ];

  return (
    <ResponsiveAside label="Workspace settings">
      <aside
        className="sticky top-10 w-52 shrink-0 pt-1 max-md:static max-md:h-full max-md:w-full max-md:overflow-y-auto max-md:p-4"
        aria-label="Settings"
      >
        <h1 className="mb-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
          Workspace
        </h1>

        <nav className="flex flex-col gap-px">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.75 text-[13px] transition-colors",
                  active
                    ? "bg-brand-soft text-primary"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </ResponsiveAside>
  );
}
