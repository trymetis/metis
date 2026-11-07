"use client";

import { Button } from "@metis/ui/components/button";
import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { Switch } from "@metis/ui/components/switch";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { type CredentialProvider, isGatewayProvider } from "@/connections/types";
import { orpc } from "@/lib/orpc";

interface CredentialConnectFormProps {
  provider: CredentialProvider;
  server: string;
  attachToWorkspaceSlug?: string;
  onConnected: () => void;
}

const emptyForm = {
  email: "",
  user: "",
  pass: "",
  separateSmtp: false,
  smtpUser: "",
  smtpPass: "",
  token: "",
  bucket: "",
  prefix: "",
  root: "",
};

const CONNECTED_LABEL: Record<CredentialProvider, string> = {
  imap: "Mailbox connected",
  cloudflare: "Mailbox connected",
  resend: "Mailbox connected",
  caldav: "Calendar connected",
  carddav: "Address book connected",
  s3: "Drive connected",
  webdav: "Drive connected",
  ftp: "Drive connected",
  sftp: "Drive connected",
};

const SUBMIT_LABEL: Record<CredentialProvider, string> = {
  imap: "Connect mailbox",
  cloudflare: "Connect mailbox",
  resend: "Connect mailbox",
  caldav: "Connect calendar",
  carddav: "Connect address book",
  s3: "Connect drive",
  webdav: "Connect drive",
  ftp: "Connect drive",
  sftp: "Connect drive",
};

export function CredentialConnectForm({
  provider,
  server,
  attachToWorkspaceSlug,
  onConnected,
}: CredentialConnectFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const credentials =
        provider === "imap"
          ? {
              provider: "imap" as const,
              server,
              user: form.user || form.email,
              pass: form.pass,
              smtpAuth: form.separateSmtp ? { user: form.smtpUser, pass: form.smtpPass } : null,
            }
          : provider === "caldav" || provider === "carddav"
            ? {
                provider,
                server,
                user: form.user || form.email,
                pass: form.pass,
              }
            : provider === "s3"
              ? {
                  provider: "s3" as const,
                  server,
                  bucket: form.bucket,
                  prefix: form.prefix.trim() || null,
                }
              : provider === "webdav" || provider === "ftp" || provider === "sftp"
                ? {
                    provider,
                    server,
                    user: form.user || form.email,
                    pass: form.pass,
                    root: form.root.trim() || null,
                  }
                : {
                    provider,
                    server,
                    token: form.token,
                  };

      await orpc.connections.createCredential({
        email: form.email,
        credentials,
        attachToWorkspaceSlug,
      });

      toast.success(CONNECTED_LABEL[provider]);
      setForm(emptyForm);
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12px] text-faint">
        {server}
      </p>

      <Field>
        <FieldLabel htmlFor="credential-email">Email address</FieldLabel>
        <Input
          className="text-[13px]"
          id="credential-email"
          type="email"
          autoComplete="off"
          required
          value={form.email}
          onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
        />
      </Field>

      {isGatewayProvider(provider) ? (
        <Field>
          <FieldLabel htmlFor="credential-token">Mailbox token</FieldLabel>
          <Input
            className="text-[13px]"
            id="credential-token"
            type="password"
            autoComplete="new-password"
            placeholder="Minted for this address by the server operator"
            required
            value={form.token}
            onChange={(e) => setForm((c) => ({ ...c, token: e.target.value }))}
          />
        </Field>
      ) : provider === "s3" ? (
        <>
          <Field>
            <FieldLabel htmlFor="credential-bucket">Bucket</FieldLabel>
            <Input
              className="text-[13px]"
              id="credential-bucket"
              autoComplete="off"
              required
              value={form.bucket}
              onChange={(e) => setForm((c) => ({ ...c, bucket: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="credential-prefix">Folder prefix</FieldLabel>
            <Input
              className="text-[13px]"
              id="credential-prefix"
              autoComplete="off"
              placeholder="Optional — limits this connection to one folder"
              value={form.prefix}
              onChange={(e) => setForm((c) => ({ ...c, prefix: e.target.value }))}
            />
          </Field>
        </>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="credential-user">Username</FieldLabel>
            <Input
              className="text-[13px]"
              id="credential-user"
              autoComplete="off"
              placeholder="Defaults to your email address"
              value={form.user}
              onChange={(e) => setForm((c) => ({ ...c, user: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="credential-pass">Password</FieldLabel>
            <Input
              className="text-[13px]"
              id="credential-pass"
              type="password"
              autoComplete="new-password"
              required
              value={form.pass}
              onChange={(e) => setForm((c) => ({ ...c, pass: e.target.value }))}
            />
          </Field>
          {(provider === "webdav" || provider === "ftp" || provider === "sftp") && (
            <Field>
              <FieldLabel htmlFor="credential-root">Folder</FieldLabel>
              <Input
                className="text-[13px]"
                id="credential-root"
                autoComplete="off"
                placeholder="Optional — limits this connection to one folder"
                value={form.root}
                onChange={(e) => setForm((c) => ({ ...c, root: e.target.value }))}
              />
            </Field>
          )}
        </>
      )}

      {provider === "imap" && (
        <>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
            <span className="text-[12px] text-faint">SMTP uses a different login</span>
            <Switch
              checked={form.separateSmtp}
              onCheckedChange={(checked) => setForm((c) => ({ ...c, separateSmtp: checked }))}
            />
          </label>

          {form.separateSmtp && (
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="credential-smtp-user">SMTP username</FieldLabel>
                <Input
                  className="text-[13px]"
                  id="credential-smtp-user"
                  autoComplete="off"
                  required
                  value={form.smtpUser}
                  onChange={(e) => setForm((c) => ({ ...c, smtpUser: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="credential-smtp-pass">SMTP password</FieldLabel>
                <Input
                  className="text-[13px]"
                  id="credential-smtp-pass"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.smtpPass}
                  onChange={(e) => setForm((c) => ({ ...c, smtpPass: e.target.value }))}
                />
              </Field>
            </div>
          )}
        </>
      )}

      <Button type="submit" disabled={busy} className="mt-1">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {SUBMIT_LABEL[provider]}
      </Button>
    </form>
  );
}
