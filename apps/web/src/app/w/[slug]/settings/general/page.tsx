"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { DEFAULT_THEME_BRAND, isThemeBrand } from "@/theme/brand";

import { AppearanceSection } from "./_components/appearance-section";
import { DeleteWorkspaceSection } from "./_components/delete-workspace-section";
import { PolicySection } from "./_components/policy-section";

export default function GeneralSettingsPage() {
  const workspaceSlug = useWorkspaceSlug();
  const query = useQuery(rpc.workspaces.list.queryOptions());
  const workspaces = query.data?.workspaces ?? null;
  const error = query.error ? query.error.message || "Could not load" : null;

  const workspace = workspaces?.find((w) => w.slug === workspaceSlug) ?? null;

  return (
    <div>
      <PageHeader
        title="General"
        description="AI policy, appearance, and deletion for this workspace."
      />

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </p>
      )}

      {!workspaces ? (
        <div className="mt-8 flex items-center gap-2 text-[13px] text-faint">
          <Loader2 className="size-3.5 animate-spin" />
          Loading workspace…
        </div>
      ) : !workspace ? (
        <p className="mt-8 text-[13px] text-faint">Unknown workspace.</p>
      ) : (
        <>
          <PolicySection
            key={`policy-${workspace.id}`}
            canEdit={workspace.role === "owner" || workspace.role === "admin"}
          />
          <AppearanceSection
            key={workspace.id}
            workspaceName={workspace.name}
            initialLogo={workspace.logo ?? null}
            initialThemeBrand={
              isThemeBrand(workspace.themeBrand) ? workspace.themeBrand : DEFAULT_THEME_BRAND
            }
            canEdit={workspace.role === "owner" || workspace.role === "admin"}
          />
          {workspace.role === "owner" && (
            <DeleteWorkspaceSection
              key={`delete-${workspace.id}`}
              workspaceSlug={workspace.slug}
              workspaceName={workspace.name}
              isOnlyWorkspace={workspaces.length <= 1}
            />
          )}
        </>
      )}
    </div>
  );
}
