"use client";

import { cn } from "@metis/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ResponsiveAside } from "@/components/mobile-aside";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { accountSettingsNav } from "@/components/settings-nav";
import { SourceLink } from "@/components/source-link";
import type { SourceInfo } from "@/source-info";
import { workspaceRootPath } from "@/workspace/path";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsSidebar({ source }: { source: SourceInfo }) {
  const pathname = usePathname();
  const nav = accountSettingsNav({ ai: usePlatformPolicy().ai });

  return (
    <ResponsiveAside label="Settings">
      <aside
        className="sticky top-10 w-52 shrink-0 pt-1 max-md:static max-md:h-full max-md:w-full max-md:overflow-y-auto max-md:p-4"
        aria-label="Settings"
      >
        <Link
          href={workspaceRootPath()}
          className="mb-4 flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-muted-foreground"
        >
          Back
        </Link>

        <h1 className="mb-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
          Settings
        </h1>

        <nav className="flex flex-col gap-px">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
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

        <SourceLink source={source} className="mt-6 px-2.5" />
      </aside>
    </ResponsiveAside>
  );
}
