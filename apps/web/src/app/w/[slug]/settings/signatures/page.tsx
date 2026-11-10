"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@metis/ui/components/accordion";
import { Button } from "@metis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Switch } from "@metis/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";

import { useSession } from "@/auth/client";
import { PageHeader } from "@/components/page-header";
import { type MailboxOption, useWorkspaceMailboxes } from "@/hooks/use-mailbox-emails";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { SignatureVariables } from "@/mail/signature-markup";

import { SignatureEditorDialog } from "./_components/signature-editor-dialog";
import { SignatureList } from "./_components/signature-list";
import { SignaturePreview } from "./_components/signature-preview";

export default function SignaturesSettingsPage() {
  const mailboxes = useWorkspaceMailboxes();
  const { data: session } = useSession();
  const name = session?.user.name ?? "";

  return (
    <div>
      <PageHeader
        title="Signatures"
        description="Your own signature wins over the mailbox's, which wins over the workspace's. Each message can switch or drop it in the composer."
      />
      <WorkspaceSection mailboxes={mailboxes} name={name} />
      {mailboxes.length > 0 && (
        <section className="mt-10" aria-label="Mailboxes">
          <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
            Mailboxes
          </h2>
          <Accordion multiple className="mt-2">
            {mailboxes.map((mailbox) => (
              <MailboxSection key={mailbox.slug} mailbox={mailbox} name={name} />
            ))}
          </Accordion>
        </section>
      )}
    </div>
  );
}

function useVars(name: string, email: string): SignatureVariables {
  return useMemo(() => ({ name, email }), [name, email]);
}

function refreshWorkspaceSignatures() {
  return refreshQueries(rpc.workspaceSignatures.list.key());
}

function WorkspaceSection({ mailboxes, name }: { mailboxes: MailboxOption[]; name: string }) {
  const scope = useWorkspaceScope();
  const query = useQuery(rpc.workspaceSignatures.list.queryOptions({ input: scope }));
  const [editingFooter, setEditingFooter] = useState(false);
  const [footerError, setFooterError] = useState<string | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const previewMailbox = mailboxes.find((m) => m.slug === previewSlug) ?? mailboxes[0];
  const previewVars = useVars(name, previewMailbox?.email ?? "");
  const previewItems = mailboxes.map((m) => ({ value: m.slug, label: m.email }));

  if (query.isPending) return <Loading />;
  if (!query.data) {
    return <p className="mt-8 text-[13px] text-destructive-text">Could not load signatures.</p>;
  }
  const { signatures, footer, canEdit } = query.data;

  async function saveFooter(next: { html: string; enabled: boolean }) {
    setFooterError(null);
    try {
      await orpc.workspaceSignatures.setFooter({ ...scope, ...next });
      await refreshWorkspaceSignatures();
    } catch (err) {
      setFooterError(err instanceof Error ? err.message : "Could not save the footer");
    }
  }

  return (
    <section className="mt-8" aria-label="Workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">Workspace</h2>
        {previewMailbox && (
          <div className="flex items-center gap-2 text-[12px] text-faint">
            Preview as
            <Select
              items={previewItems}
              value={previewMailbox.slug}
              onValueChange={(value) => {
                if (typeof value === "string") setPreviewSlug(value);
              }}
            >
              <SelectTrigger size="sm" aria-label="Preview as mailbox">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {previewItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <SignatureList
        title="Workspace signatures"
        description="Used for anyone sending from this workspace who has no mailbox or personal default."
        readOnlyNote="Only owners and admins can change them."
        signatures={signatures}
        canEdit={canEdit}
        previewVars={previewVars}
        onSave={async (draft) => {
          await orpc.workspaceSignatures.save({ ...scope, signature: draft });
          await refreshWorkspaceSignatures();
        }}
        onDelete={async (id) => {
          await orpc.workspaceSignatures.delete({ ...scope, id });
          await refreshWorkspaceSignatures();
        }}
      />

      <section className="mt-6" aria-label="Footer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-medium text-foreground">Footer</h3>
            <p className="text-[12px] text-faint">
              Added to the end of every message sent through Metis from this workspace. Senders
              cannot remove it.
              {!canEdit && " Only owners and admins can change it."}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Switch
                checked={footer.enabled}
                disabled={!footer.html}
                aria-label="Add the footer to outgoing mail"
                onCheckedChange={(enabled) => void saveFooter({ html: footer.html, enabled })}
              />
              <Button variant="outline" size="sm" onClick={() => setEditingFooter(true)}>
                <Pencil />
                Edit
              </Button>
            </div>
          )}
        </div>
        <div className="mt-2">
          <SignaturePreview html={footer.html} vars={previewVars} />
        </div>
        {!footer.enabled && footer.html && (
          <p className="mt-1 text-[12px] text-faint">Off: not added to outgoing mail.</p>
        )}
        {footerError && <p className="mt-2 text-[12px] text-destructive-text">{footerError}</p>}
      </section>

      {editingFooter && (
        <SignatureEditorDialog
          kind="footer"
          title="Mail footer"
          previewVars={previewVars}
          initial={{ name: "", html: footer.html, defaultNew: false, defaultReply: false }}
          onClose={() => setEditingFooter(false)}
          onSave={async (draft) => {
            await orpc.workspaceSignatures.setFooter({
              ...scope,
              html: draft.html,
              enabled: footer.enabled || !footer.html,
            });
            await refreshWorkspaceSignatures();
          }}
        />
      )}
    </section>
  );
}

function MailboxSection({ mailbox, name }: { mailbox: MailboxOption; name: string }) {
  const { workspaceSlug } = useWorkspaceScope();
  const input = { workspaceSlug, mailboxSlug: mailbox.slug };
  const query = useQuery(rpc.mail.signatures.list.queryOptions({ input }));
  const refresh = () => refreshQueries(rpc.mail.signatures.list.key({ input }));
  const previewVars = useVars(name, mailbox.email);
  const counts = query.data
    ? `${query.data.mailbox.length} mailbox · ${query.data.personal.length} yours`
    : null;

  return (
    <AccordionItem
      value={mailbox.slug}
      render={<section />}
      aria-label={`Signatures for ${mailbox.email}`}
      className="border-border-soft"
    >
      <AccordionTrigger className="items-center gap-3 hover:no-underline">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-normal text-foreground">
          {mailbox.email}
        </span>
        {counts && <span className="shrink-0 text-[12px] font-normal text-faint">{counts}</span>}
      </AccordionTrigger>
      <AccordionContent>
        {query.isPending ? (
          <Loading />
        ) : !query.data ? (
          <p className="mt-2 text-[13px] text-destructive-text">Could not load signatures.</p>
        ) : (
          <>
            <SignatureList
              title="Mailbox signatures"
              description="Used by everyone who sends from this mailbox, in every workspace it is in."
              readOnlyNote="Only the person who connected it can change them."
              signatures={query.data.mailbox}
              canEdit={query.data.canEditMailbox}
              previewVars={previewVars}
              onSave={async (draft) => {
                await orpc.mail.signatures.save({ ...input, scope: "mailbox", signature: draft });
                await refresh();
              }}
              onDelete={async (id) => {
                await orpc.mail.signatures.delete({ ...input, scope: "mailbox", id });
                await refresh();
              }}
            />
            <SignatureList
              title="Your signatures"
              description="Only for you when you send from this mailbox."
              signatures={query.data.personal}
              canEdit
              previewVars={previewVars}
              onSave={async (draft) => {
                await orpc.mail.signatures.save({ ...input, scope: "personal", signature: draft });
                await refresh();
              }}
              onDelete={async (id) => {
                await orpc.mail.signatures.delete({ ...input, scope: "personal", id });
                await refresh();
              }}
            />
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function Loading() {
  return (
    <div className="mt-4 flex items-center gap-2 text-[13px] text-faint">
      <Loader2 className="size-3.5 animate-spin" />
      Loading signatures…
    </div>
  );
}
