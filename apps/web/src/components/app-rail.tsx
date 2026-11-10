"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import {
  AppWindow,
  BookUser,
  CalendarDays,
  GitBranch,
  HardDrive,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
  Workflow,
} from "lucide-react";
import type { Route } from "next";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/auth/client";
import { isNativeUserAgent, NATIVE_SETTINGS_PATH } from "@/auth/native-link";
import { clearPreviewCache } from "@/drive/preview-cache";
import { useHydrated } from "@/hooks/use-stored-item";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { getInitials } from "@/lib/utils";
import type { SourceInfo } from "@/source-info";
import { useSearchStore } from "@/store/search-store";
import {
  assistantPath,
  calendarPath,
  calendarRootPath,
  contactsPath,
  contactsRootPath,
  drivePath,
  driveRootPath,
  mailPath,
  mailRootPath,
  workflowPath,
} from "@/workspace/path";

import { usePlatformPolicy } from "./platform-policy-context";
import { WorkspaceMenuTile } from "./workspace-menu-tile";
import { WorkspaceRailSwitcher } from "./workspace-rail-switcher";

interface AppRailProps {
  user: { id: string; name: string; email: string; image?: string | null };
  hasDashboard: boolean;
  source: SourceInfo;
}

async function handleSignOut() {
  await clearPreviewCache();
  await signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = "/";
      },
    },
  });
}

export function AppRail({ user, hasDashboard, source }: AppRailProps) {
  const aiEnabled = usePlatformPolicy().ai;
  const pathname = usePathname();
  const { mailboxSlug, calendarSlug, driveSlug, addressBookSlug, section } = useWorkspacePath();
  const workspaceSlug = useWorkspaceSlug();
  const { workspaces } = useWorkspaces();
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHydrated();

  const openSearch = useSearchStore((s) => s.openSearch);
  const current = workspaces.find((w) => w.slug === workspaceSlug);
  const isDark = mounted && resolvedTheme === "dark";
  const inNativeApp = mounted && isNativeUserAgent(navigator.userAgent);

  const inboxHref = mailboxSlug
    ? mailPath(workspaceSlug, mailboxSlug, "inbox")
    : mailRootPath(workspaceSlug);
  const calendarHref = calendarSlug
    ? calendarPath(workspaceSlug, calendarSlug)
    : calendarRootPath(workspaceSlug);
  const driveHref = driveSlug ? drivePath(workspaceSlug, driveSlug) : driveRootPath(workspaceSlug);
  const contactsHref = addressBookSlug
    ? contactsPath(workspaceSlug, addressBookSlug)
    : contactsRootPath(workspaceSlug);
  const assistantHref = assistantPath(workspaceSlug);
  const workflowHref = workflowPath(workspaceSlug);

  return (
    <TooltipProvider delay={200}>
      <nav
        className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-panel pt-4 pb-4"
        aria-label="App navigation"
      >
        <WorkspaceMenuTile workspace={current} workspaceSlug={workspaceSlug} />

        <Divider />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Search"
                aria-keyshortcuts="Control+K Meta+K"
                onClick={() => openSearch()}
                className="h-10 w-10 shrink-0 rounded-md text-faint hover:bg-hover hover:text-muted-foreground"
              >
                <Search className="size-4.5" strokeWidth={1.8} />
              </Button>
            }
          />
          <TooltipContent side="right" className="pointer-coarse:hidden">
            Search · Ctrl/⌘ K
          </TooltipContent>
        </Tooltip>

        <IconLink label="Inbox" href={inboxHref} active={section === "mail"}>
          <Inbox className="size-4.5" strokeWidth={1.8} />
          <span className="absolute top-1.5 right-1.5 h-1.75 w-1.75 rounded-full border-[1.5px] border-panel bg-primary" />
        </IconLink>

        <IconLink label="Calendar" href={calendarHref} active={section === "calendar"}>
          <CalendarDays className="size-4.5" strokeWidth={1.8} />
        </IconLink>

        <IconLink label="Drive" href={driveHref} active={section === "drive"}>
          <HardDrive className="size-4.5" strokeWidth={1.8} />
        </IconLink>

        <IconLink label="Contacts" href={contactsHref} active={section === "contacts"}>
          <BookUser className="size-4.5" strokeWidth={1.8} />
        </IconLink>

        {aiEnabled && (
          <IconLink
            label="Workspace AI"
            href={assistantHref}
            active={pathname.includes("/assistant")}
          >
            <Sparkles className="size-4.5" strokeWidth={1.8} />
          </IconLink>
        )}

        <IconLink label="Workflows" href={workflowHref} active={pathname.includes("/workflow")}>
          <Workflow className="size-4.5" strokeWidth={1.8} />
        </IconLink>

        <Divider />

        <WorkspaceRailSwitcher />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={user.name}
                      className="mt-1 size-8 shrink-0 cursor-pointer rounded-full border border-border bg-linear-to-br from-active to-surface font-medium text-muted-foreground text-xs tracking-wider"
                    >
                      {getInitials(user.name).slice(0, 2)}
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="right" className="pointer-coarse:hidden">
              {user.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-foreground">{user.name}</p>
              <p className="text-xs text-faint">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings/account" />}>
              <Settings />
              Settings
            </DropdownMenuItem>
            {inNativeApp && (
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI renders the item children inside this anchor; a full navigation lets the desktop shell intercept the path
              <DropdownMenuItem render={<a href={NATIVE_SETTINGS_PATH} />}>
                <AppWindow />
                App settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem render={<Link href="/settings/workspaces" />}>
              <Users />
              Workspaces
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/connections" />}>
              <Link2 />
              Connections
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/mailboxes" />}>
              <Mail />
              Mailboxes
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/calendars" />}>
              <CalendarDays />
              Calendars
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/drives" />}>
              <HardDrive />
              Drives
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings/address-books" />}>
              <BookUser />
              Address books
            </DropdownMenuItem>
            {hasDashboard && (
              <DropdownMenuItem render={<Link href="/dashboard" />}>
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setTheme(isDark ? "light" : "dark")}>
              {isDark ? <Sun /> : <Moon />}
              {isDark ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SourceRailLink source={source} />
      </nav>
    </TooltipProvider>
  );
}

function SourceRailLink({ source }: { source: SourceInfo }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code"
            className="mt-1 flex w-12 shrink-0 flex-col items-center gap-1 rounded-md py-1.5 text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
          >
            <GitBranch className="size-4" strokeWidth={1.8} />
            <span className="max-w-full truncate font-mono text-[9px] leading-none">
              v{source.version}
            </span>
          </a>
        }
      />
      <TooltipContent side="right" className="pointer-coarse:hidden">
        Source code · v{source.version}
      </TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div className="my-0.5 h-px w-8 shrink-0 bg-border" />;
}

function IconLink({
  children,
  label,
  href,
  active,
}: {
  children: React.ReactNode;
  label: string;
  href: Route;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={label}
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-brand-soft text-primary"
                : "bg-transparent text-faint hover:bg-hover hover:text-muted-foreground",
            )}
          >
            {children}
          </Link>
        }
      />
      <TooltipContent side="right" className="pointer-coarse:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
