import { PageHeader } from "@/components/page-header";

import { AccountsView } from "./_components/accounts-view";

export default function DashboardAccountsPage() {
  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Who has an account, how they are secured, and the invites waiting to be accepted."
      />

      <div className="mt-6">
        <AccountsView />
      </div>
    </div>
  );
}
