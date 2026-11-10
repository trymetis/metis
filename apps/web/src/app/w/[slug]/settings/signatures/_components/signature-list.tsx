"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@metis/ui/components/accordion";
import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { SignatureVariables } from "@/mail/signature-markup";

import { type SignatureDraft, SignatureEditorDialog } from "./signature-editor-dialog";
import { SignaturePreview } from "./signature-preview";

export interface ListedSignature {
  id: string;
  name: string;
  html: string;
  defaultNew: boolean;
  defaultReply: boolean;
}

const EMPTY: SignatureDraft = { name: "", html: "", defaultNew: false, defaultReply: false };

export function SignatureList({
  title,
  description,
  signatures,
  canEdit,
  readOnlyNote,
  previewVars,
  onSave,
  onDelete,
}: {
  title: string;
  description: string;
  signatures: ListedSignature[];
  canEdit: boolean;
  readOnlyNote?: string;
  previewVars: SignatureVariables;
  onSave: (draft: SignatureDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<SignatureDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the signature");
    }
  }

  return (
    <section className="mt-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
          <p className="text-[12px] text-faint">
            {description}
            {!canEdit && readOnlyNote ? ` ${readOnlyNote}` : ""}
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditing(EMPTY)}>
            <Plus />
            Add
          </Button>
        )}
      </div>

      {signatures.length === 0 ? (
        <p className="mt-2 text-[12px] text-faint">None yet.</p>
      ) : (
        <Accordion multiple className="mt-2 rounded-lg border border-border-soft">
          {signatures.map((s) => (
            <AccordionItem key={s.id} value={s.id} className="not-last:border-border-soft">
              <div className="flex items-center gap-2 px-3">
                <div className="min-w-0 flex-1">
                  <AccordionTrigger className="items-center gap-2 py-2 font-normal hover:no-underline">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {s.name}
                    </span>
                    {s.defaultNew && <Badge variant="secondary">New messages</Badge>}
                    {s.defaultReply && <Badge variant="secondary">Replies</Badge>}
                  </AccordionTrigger>
                </div>
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => void remove(s.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
              <AccordionContent className="px-3 pb-3">
                <SignaturePreview html={s.html} vars={previewVars} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {error && <p className="mt-2 text-[12px] text-destructive-text">{error}</p>}

      {editing && (
        <SignatureEditorDialog
          initial={editing}
          title={editing.id ? "Edit signature" : "New signature"}
          previewVars={previewVars}
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}
    </section>
  );
}
