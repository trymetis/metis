import { PageHeader } from "@/components/page-header";

import { InvitesView } from "./_components/invites-view";

export default function DashboardInvitesPage() {
  return (
    <div>
      <PageHeader
        title="Invites"
        description="Account invites waiting to be accepted. Each one creates an account with its own workspace."
      />

      <div className="mt-6">
        <InvitesView />
      </div>
    </div>
  );
}
