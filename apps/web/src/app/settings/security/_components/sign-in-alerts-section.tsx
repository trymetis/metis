"use client";

import { Switch } from "@metis/ui/components/switch";
import { BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { InfoHint } from "@/components/info-hint";
import { updateCachedPreferences, useUserPreferences } from "@/hooks/use-preferences";
import { orpc } from "@/lib/orpc";

export function SignInAlertsSection({ email }: { email: string }) {
  const loaded = useUserPreferences();
  const [on, setOn] = useState<boolean | null>(loaded?.signInAlerts ?? null);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(loaded);

  if (loaded !== synced) {
    setSynced(loaded);
    if (loaded) setOn(loaded.signInAlerts);
  }

  async function update(next: boolean) {
    const previous = on;
    setOn(next);
    setSaving(true);
    try {
      const prefs = await orpc.user.updatePreferences({ signInAlerts: next });
      updateCachedPreferences(prefs);
      setOn(prefs.signInAlerts);
    } catch (err) {
      setOn(previous);
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <BellRing className="size-4 text-brand-text" />
          <h2 className="text-[13px] font-medium text-foreground">Sign-in alerts</h2>
          <InfoHint label="Sign-in alerts">
            Emails {email} each time someone signs in to this account, with the device, IP address
            and time, so a sign-in you didn&rsquo;t make doesn&rsquo;t go unnoticed.
          </InfoHint>
        </div>
      </div>
      <Switch
        aria-label="Email me when someone signs in"
        checked={on === true}
        disabled={on === null || saving}
        onCheckedChange={(checked) => update(checked)}
      />
    </section>
  );
}
