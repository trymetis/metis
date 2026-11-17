import { PageHeader } from "@/components/page-header";

import { ThemesView } from "./_components/themes-view";

export default function DashboardThemesPage() {
  return (
    <div>
      <PageHeader
        title="Themes"
        description="The themes every workspace can pick, beside the built-in ones."
      />

      <div className="mt-6">
        <ThemesView />
      </div>
    </div>
  );
}
