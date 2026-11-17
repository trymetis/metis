import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { instanceRoleOf } from "@/auth/instance-role";
import { getAppUser, getWorkspaceMembership } from "@/auth/session";
import { AppRail } from "@/components/app-rail";
import { ConnectServersProvider } from "@/components/connect-servers-context";
import { MobileAsideProvider } from "@/components/mobile-aside";
import { WorkspaceSearch } from "@/components/search/workspace-search";
import { WorkspaceAccessProvider } from "@/components/workspace-access";
import { WorkspaceScopeProvider } from "@/components/workspace-scope";
import { connectServers } from "@/connections";
import { sourceInfo } from "@/source-info";
import { getWorkspacePolicy } from "@/workspace";
import { workspaceRootPath } from "@/workspace/path";
import { workspaceAllowsAi } from "@/workspace/policy";

import { WorkspaceBrand } from "./_components/workspace-brand";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  const membership = await getWorkspaceMembership(appUser.userId, slug);
  if (!membership) redirect(workspaceRootPath());

  const policy = await getWorkspacePolicy(membership.id);
  const hasDashboard =
    (await instanceRoleOf({ id: appUser.userId, email: appUser.user.email })) !== null;

  return (
    <WorkspaceScopeProvider workspaceSlug={slug}>
      <WorkspaceBrand theme={membership.theme} />
      <WorkspaceAccessProvider
        access={{
          workspaceAi: policy ? workspaceAllowsAi(policy) : false,
          role: membership.role,
          userId: appUser.userId,
          hasDashboard,
        }}
      >
        <ConnectServersProvider servers={connectServers()}>
          <MobileAsideProvider>
            <div className="flex h-dvh overflow-hidden bg-background text-foreground">
              <AppRail user={appUser.user} hasDashboard={hasDashboard} source={sourceInfo()} />
              <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <WorkspaceSearch />
          </MobileAsideProvider>
        </ConnectServersProvider>
      </WorkspaceAccessProvider>
    </WorkspaceScopeProvider>
  );
}
