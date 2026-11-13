import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { instanceRoleOf } from "@/auth/instance-role";
import { getAppUser } from "@/auth/session";
import { SYSTEM_EXPORTS_NAV } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

import { ExportsView } from "./_components/exports-view";

export const dynamic = "force-dynamic";

export default async function DashboardSystemExportsPage() {
  const appUser = await getAppUser(await headers());
  const role = appUser
    ? await instanceRoleOf({ id: appUser.userId, email: appUser.user.email })
    : null;
  if (role !== "owner") notFound();
  const Icon = SYSTEM_EXPORTS_NAV.icon;
  return (
    <div>
      <SystemPageHeader
        eyebrow="System"
        title={SYSTEM_EXPORTS_NAV.label}
        description={SYSTEM_EXPORTS_NAV.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <ExportsView />
    </div>
  );
}
