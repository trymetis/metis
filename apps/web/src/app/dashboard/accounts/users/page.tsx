import { PageHeader } from "@/components/page-header";

import { UsersView } from "./_components/users-view";

export default function DashboardUsersPage() {
  return (
    <div>
      <PageHeader
        title="Users"
        description="Every account on this instance, its instance role and whether it is banned."
      />

      <div className="mt-6">
        <UsersView />
      </div>
    </div>
  );
}
