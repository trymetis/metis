"use client";

import { Button } from "@metis/ui/components/button";
import { Switch } from "@metis/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Link2Off, type LucideIcon, UserCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InfoHint } from "@/components/info-hint";
import { PageHeader } from "@/components/page-header";
import { updateCachedPreferences, useUserPreferences } from "@/hooks/use-preferences";
import { orpc } from "@/lib/orpc";
import type { UserPreferences } from "@/server/schema";
import { remoteAllowQuery, useMailPrivacyStore } from "@/store/mail-privacy-store";

function CardTitle({
  icon: Icon,
  title,
  details,
}: {
  icon: LucideIcon;
  title: string;
  details: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-brand-text" />
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      <InfoHint label={title}>
        <span className="flex flex-col gap-2">
          {details.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </InfoHint>
    </div>
  );
}

export function PrivacySettings({ imageProxy }: { imageProxy: boolean }) {
  const loaded = useUserPreferences();
  const [prefs, setPrefs] = useState<UserPreferences | null>(loaded);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(loaded);
  const allowQuery = useQuery({ ...remoteAllowQuery, staleTime: 0 });
  const allow = allowQuery.data?.entries ?? null;
  const revokeRemote = useMailPrivacyStore((s) => s.revokeRemote);

  if (loaded !== synced) {
    setSynced(loaded);
    if (loaded) setPrefs(loaded);
  }

  const allowFailed = allowQuery.isError;
  useEffect(() => {
    if (allowFailed) toast.error("Could not load trusted senders");
  }, [allowFailed]);

  async function update(patch: Partial<UserPreferences>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setSaving(true);
    try {
      const next = await orpc.user.updatePreferences(patch);
      updateCachedPreferences(next);
      setPrefs(next);
    } catch (err) {
      setPrefs(previous);
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeRemote(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  }

  if (!prefs) {
    return <div className="text-[13px] text-faint">Loading privacy settings…</div>;
  }

  return (
    <div>
      <PageHeader
        title="Privacy"
        description="How messages you open talk to their senders. These choices are yours alone and follow you across every mailbox and workspace."
      />

      <div className="mt-8 flex flex-col gap-6">
        <section className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <CardTitle
              icon={ImageIcon}
              title="Load remote images automatically"
              details={[
                "Remote images can tell a sender that you opened a message, when, and from where.",
                "Off, each message asks first: load its images once, or always for that sender or domain.",
                "Known trackers are removed either way, and fonts, stylesheets and media from the web never load.",
                imageProxy
                  ? "This server loads images on your behalf, so senders never see your IP address, device or cookies. They still learn that the message was opened, and when."
                  : "Images load straight from the sender's servers, which see your IP address and browser.",
              ]}
            />
            <p className="mt-1 truncate text-[12px] text-faint">
              Off, each message asks before loading images.
            </p>
          </div>
          <Switch
            aria-label="Load remote images automatically"
            checked={prefs.mailRemoteContent === "load"}
            disabled={saving}
            onCheckedChange={(checked) => update({ mailRemoteContent: checked ? "load" : "block" })}
          />
        </section>

        <section className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <CardTitle
              icon={Link2Off}
              title="Clean tracking from links"
              details={[
                "Removes tracking parameters and unwraps redirect links when the destination is readable from the link itself, without visiting it.",
                "Links that can't be unwrapped are marked as tracked when you hover them.",
                "Turn this off if a cleaned link stops working.",
              ]}
            />
            <p className="mt-1 truncate text-[12px] text-faint">
              Strips tracking parameters and redirects from links in mail.
            </p>
          </div>
          <Switch
            aria-label="Clean tracking from links"
            checked={prefs.mailCleanLinks}
            disabled={saving}
            onCheckedChange={(checked) => update({ mailCleanLinks: checked })}
          />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <CardTitle
            icon={UserCheck}
            title="Senders whose images always load"
            details={[
              'Added with "Always from …" on a message\'s blocked-images chip.',
              "A domain also covers its subdomains; an address covers only that sender.",
              "A sender address can be forged, so trust only ever loads images, nothing else.",
            ]}
          />
          <p className="mt-1 truncate text-[12px] text-faint">
            Images from these senders and domains load without asking.
          </p>
          {allow === null ? (
            <p className="mt-3 text-[12px] text-faint">Loading…</p>
          ) : allow.length === 0 ? (
            <p className="mt-3 text-[12px] text-faint">No trusted senders.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border-soft rounded-lg border border-border-soft">
              {allow.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] text-foreground">
                      {entry.value}
                    </span>
                    <span className="text-[11px] text-faint">
                      {entry.kind === "address" ? "Sender" : "Domain and its subdomains"}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${entry.value}`}
                    onClick={() => revoke(entry.id)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
