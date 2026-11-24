"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { Fingerprint, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import type { PublicPasskey } from "@/auth/two-factor/methods";
import { addPasskey, usePasskeySupport } from "@/auth/two-factor/passkey-client";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { refreshTwoFactorMethods, useTwoFactorMethods } from "@/hooks/use-two-factor-methods";

const NAME_MAX = 64;

const ADDED = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

type PasskeyItem = PublicPasskey;

export function PasskeysSection() {
  const methods = useTwoFactorMethods().data;
  const supported = usePasskeySupport();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<PasskeyItem | null>(null);
  const [removing, setRemoving] = useState<PasskeyItem | null>(null);
  const list: PasskeyItem[] = methods?.passkeys ?? [];
  const onlyMethod = methods?.methods.length === 1 && list.length === 1;

  async function add(code: string) {
    await addPasskey({ name, code });
    setName("");
    refreshTwoFactorMethods();
    toast.success("Passkey added");
  }

  async function remove(item: PasskeyItem, code: string) {
    const { error } = await authClient.twoFactor.remove({ method: "passkey", id: item.id, code });
    if (error) throw new Error(error.message || "Couldn't remove the passkey");
    refreshTwoFactorMethods();
    toast.success("Passkey removed");
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-4 text-brand-text" />
        <h2 className="text-[13px] font-medium text-foreground">Passkeys</h2>
      </div>
      <p className="mt-1 text-[12px] text-faint">
        Confirm sign-ins and sensitive changes with Touch ID, Windows Hello, your phone or a
        security key instead of typing a code. Your backup codes keep working, and so does your
        authenticator app if you have one.
      </p>

      {list.length > 0 && (
        <ul aria-label="Passkeys" className="mt-3 flex flex-col divide-y divide-border">
          {list.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{item.name}</p>
                <p className="text-[12px] text-faint">
                  {item.createdAt ? `Added ${ADDED.format(new Date(item.createdAt))}` : "Added"}
                  {item.backedUp ? " · Synced" : " · This device only"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${item.name}`}
                  onClick={() => setRenaming(item)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.name}`}
                  disabled={onlyMethod}
                  onClick={() => setRemoving(item)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col items-start gap-2">
        <Button variant="outline" disabled={!supported} onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add a passkey
        </Button>
        {!supported && (
          <p className="text-[12px] text-faint">This browser can&rsquo;t create passkeys.</p>
        )}
        {onlyMethod && (
          <p className="text-[12px] text-faint">
            Add an authenticator app or another passkey first. You need at least one way to confirm
            it&rsquo;s you.
          </p>
        )}
      </div>

      <TotpConfirmDialog
        open={adding}
        title="Add a passkey"
        body="Name it so you can tell your passkeys apart, then confirm it's you. Your browser asks you to create the passkey next."
        confirmLabel="Add passkey"
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setName("");
        }}
        onConfirm={add}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="Passkey name, like Work laptop"
          aria-label="Passkey name"
          className="text-[13px]"
        />
      </TotpConfirmDialog>

      <TotpConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : "Remove passkey?"}
        body="It stops working for this account straight away. Confirm it's you to remove it."
        confirmLabel="Remove passkey"
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        onConfirm={async (code) => {
          if (removing) await remove(removing, code);
        }}
      />

      <RenamePasskeyDialog item={renaming} onClose={() => setRenaming(null)} />
    </section>
  );
}

function RenamePasskeyDialog({ item, onClose }: { item: PasskeyItem | null; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  if (item && item.id !== shown) {
    setShown(item.id);
    setValue(item.name);
    setError(null);
  }

  async function save(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.twoFactor.rename({
        method: "passkey",
        id: item.id,
        name: value.trim(),
      });
      if (err) throw new Error(err.message || "Couldn't rename the passkey");
      refreshTwoFactorMethods();
      setShown(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the passkey");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setShown(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename passkey</DialogTitle>
          <DialogDescription>
            The name shows in your passkey list and in security activity.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={NAME_MAX}
            autoFocus
            aria-label="Passkey name"
            disabled={busy}
            className="text-[13px]"
          />
          {error && <p className="text-[12px] text-destructive-text">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || value.trim().length === 0}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
