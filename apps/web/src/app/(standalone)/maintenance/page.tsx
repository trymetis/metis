import { MetisMark } from "@metis/ui/components/metis-mark";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { maintenanceSinceText } from "@/maintenance/since";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Down for maintenance",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  const { since } = config.maintenance;
  if (!(since instanceof Date)) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white p-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm text-center">
        <MetisMark className="mx-auto mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Down for maintenance
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">{maintenanceSinceText(since)}</p>
        <p className="mt-1 text-sm text-neutral-500">Try again in a few minutes.</p>
      </div>
    </main>
  );
}
