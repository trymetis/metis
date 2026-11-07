"use client";

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient, refreshQueries } from "@/lib/query-client";
import { orderByIds } from "@/lib/utils";
import type { ThemeBrandId } from "@/theme/brand";
import { parseWorkspacePath, switchWorkspacePath } from "@/workspace/path";

import { cachedPreferences, updateCachedPreferences, useUserPreferences } from "./use-preferences";

export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  logo: string | null;
  themeBrand: ThemeBrandId;
  mailboxCount: number;
  inboxMailboxSlug: string | null;
  calendarCount: number;
  firstCalendarSlug: string | null;
  driveCount: number;
  firstDriveSlug: string | null;
  addressBookCount: number;
  firstAddressBookSlug: string | null;
}

const TTL_MS = 60_000;

export const workspacesQuery = rpc.workspaces.list.queryOptions({ staleTime: TTL_MS });

export function invalidateWorkspaces() {
  void refreshQueries(rpc.workspaces.list.key());
}

function getOrderedWorkspaces(pathname: string): {
  workspaces: WorkspaceItem[];
  activeSlug: string | null;
} {
  const cached: WorkspaceItem[] | undefined = getQueryClient().getQueryData(
    workspacesQuery.queryKey,
  )?.workspaces;
  if (!cached) return { workspaces: [], activeSlug: null };
  return {
    workspaces: orderByIds(cached, cachedPreferences()?.workspaceOrder ?? []),
    activeSlug: parseWorkspacePath(pathname).workspaceSlug,
  };
}

export function useWorkspaceHotkeys() {
  const router = useRouter();
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Alt") setAltHeld(true);
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!/^Digit[1-9]$/.test(e.code)) return;
      const { workspaces, activeSlug } = getOrderedWorkspaces(window.location.pathname);
      const target = workspaces[Number(e.code.slice(5)) - 1];
      if (!target) return;
      e.preventDefault();
      if (target.slug !== activeSlug) {
        router.push(switchWorkspaceHref(window.location.pathname, target));
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!e.altKey) setAltHeld(false);
    }
    function onBlur() {
      setAltHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [router]);

  return { altHeld };
}

export function switchWorkspaceHref(pathname: string, target: WorkspaceItem): Route {
  return switchWorkspacePath(pathname, { slug: target.slug });
}

export function useWorkspaces() {
  const pathname = usePathname();
  const workspaceSlug = parseWorkspacePath(pathname).workspaceSlug;
  const prefs = useUserPreferences();
  const query = useQuery(workspacesQuery);
  const loaded: WorkspaceItem[] | undefined = query.data?.workspaces;

  const reorder = useCallback(
    (orderedIds: string[]) => {
      if (prefs) {
        updateCachedPreferences({ ...prefs, workspaceOrder: orderedIds });
      }
      orpc.user
        .updatePreferences({ workspaceOrder: orderedIds })
        .then((saved) => updateCachedPreferences(saved))
        .catch((err) => {
          console.error("[workspace-rail] reorder failed to save", err);
        });
    },
    [prefs],
  );

  return {
    workspaces: loaded ? orderByIds(loaded, prefs?.workspaceOrder ?? []) : [],
    activeId: loaded?.find((w) => w.slug === workspaceSlug)?.id ?? null,
    loaded: loaded !== undefined,
    reorder,
  };
}
