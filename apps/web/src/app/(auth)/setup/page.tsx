import { redirect } from "next/navigation";

import { legalConfig } from "@/auth/legal-consent";
import { ownerEmail } from "@/auth/owner";
import { ownerHasAccount } from "@/auth/signup";
import { config } from "@/config";

import { SetupInner } from "./_components/setup-inner";
import { SetupUnavailable } from "./_components/setup-unavailable";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await ownerHasAccount()) redirect("/");

  if (!config.app.setupCode) {
    console.warn(
      "[setup] /setup was opened but METIS_SETUP_CODE is unset — no account can be created until it is",
    );
    return <SetupUnavailable />;
  }

  return <SetupInner legal={legalConfig()} pinnedEmail={ownerEmail()} />;
}
