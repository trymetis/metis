"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { ListOrdered } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import { isTwoFactorMethod, type TwoFactorMethod } from "@/auth/two-factor/methods";
import { refreshTwoFactorMethods, useTwoFactorMethods } from "@/hooks/use-two-factor-methods";

const METHOD_ITEMS: { value: TwoFactorMethod; label: string }[] = [
  { value: "passkey", label: "Passkey" },
  { value: "totp", label: "Authenticator app" },
];

export function DefaultMethodSection() {
  const methods = useTwoFactorMethods().data;
  const [saving, setSaving] = useState(false);

  if (!methods || methods.methods.length < 2) return null;

  async function choose(preferred: TwoFactorMethod) {
    setSaving(true);
    try {
      const { error } = await authClient.twoFactor.preferences({ preferred });
      if (error) throw new Error(error.message || "Couldn't save your default");
      refreshTwoFactorMethods();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your default");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ListOrdered className="size-4 text-brand-text" />
          <h2 className="text-[13px] font-medium text-foreground">Ask me first with</h2>
        </div>
        <p className="mt-1 text-[12px] text-faint">
          Shown first when you sign in or confirm a change. You can always pick another.
        </p>
      </div>
      <Select
        value={methods.preferred}
        items={METHOD_ITEMS}
        disabled={saving}
        onValueChange={(value) => {
          if (isTwoFactorMethod(value)) void choose(value);
        }}
      >
        <SelectTrigger aria-label="Ask me first with" className="sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METHOD_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}
