"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { BookUser, CalendarPlus, Copy, Mail, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { composeMail, newEventWith } from "@/components/search/navigate";
import { personQuery } from "@/components/search/queries";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { route } from "@/lib/route";
import type { ContactMatch } from "@/server/schema";
import { useSearchStore } from "@/store/search-store";

import { draftForAddress, matchHref } from "./use-save-contact";

export function PersonMenu({
  email,
  name,
  match,
  onSave,
  className,
  decorative = false,
  children,
}: {
  email: string;
  name?: string;
  match: ContactMatch | undefined;
  onSave: (draft: ReturnType<typeof draftForAddress>) => void;
  className?: string;
  decorative?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const openSearch = useSearchStore((s) => s.openSearch);
  const label = name || email;

  function copyEmail() {
    navigator.clipboard
      .writeText(email)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            {...(decorative
              ? { "aria-hidden": true, tabIndex: -1 }
              : { "aria-label": `${label} (${email})` })}
            className={cn(
              "min-w-0 cursor-pointer rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          >
            {children}
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        {match ? (
          <DropdownMenuItem onClick={() => router.push(route(matchHref(workspaceSlug, match)))}>
            <BookUser />
            Open contact
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onSave(draftForAddress(email, name))}>
            <UserPlus />
            Add to contacts
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => composeMail(router, workspaceSlug, { to: email })}>
          <Mail />
          Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => newEventWith(router, workspaceSlug, [email])}>
          <CalendarPlus />
          Invite to an event
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSearch(personQuery(email))}>
          <Search />
          <span className="truncate">Search everything with {label}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyEmail}>
          <Copy />
          Copy email
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SavedBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-surface text-brand-text",
        className,
      )}
    >
      <BookUser className="size-2.5" />
    </span>
  );
}
