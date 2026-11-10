"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { Textarea } from "@metis/ui/components/textarea";
import { cn } from "@metis/ui/lib/utils";
import { Link } from "@tiptap/extension-link";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { SIGNATURE_NAME_MAX } from "@/mail/signature-markup";

import { SignaturePreview } from "./signature-preview";

export interface SignatureDraft {
  id?: string;
  name: string;
  html: string;
  defaultNew: boolean;
  defaultReply: boolean;
}

const HTML_ONLY = /<(img|table|tr|td|th|font|center|hr)\b|\sstyle=|\swidth=|\sbgcolor=/i;

export function SignatureEditorDialog({
  initial,
  kind = "signature",
  title,
  onClose,
  onSave,
}: {
  initial: SignatureDraft;
  kind?: "signature" | "footer";
  title: string;
  onClose: () => void;
  onSave: (draft: SignatureDraft) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [html, setHtml] = useState(initial.html);
  const [defaultNew, setDefaultNew] = useState(initial.defaultNew);
  const [defaultReply, setDefaultReply] = useState(initial.defaultReply);
  const [mode, setMode] = useState<"rich" | "html">(HTML_ONLY.test(initial.html) ? "html" : "rich");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const richAllowed = !HTML_ONLY.test(html);
  const isSignature = kind === "signature";

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.extend({ inclusive: () => false }).configure({ openOnClick: false }),
    ],
    content: initial.html,
    editorProps: {
      attributes: {
        class:
          "min-h-[140px] rounded-lg border border-input px-3 py-2 text-[13px] leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
    immediatelyRender: false,
  });

  function switchMode(next: "rich" | "html") {
    if (next === mode) return;
    if (next === "rich") editor?.commands.setContent(html);
    setMode(next);
  }

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSignature && !name.trim()) {
      setError("Give the signature a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ id: initial.id, name: name.trim(), html, defaultNew, defaultReply });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the signature");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isSignature
                ? 'Use "{{name}}" and "{{email}}" to fill in the sender. Images must be https links.'
                : "Added after the signature and any quoted text on every message sent from this workspace. Images must be https links."}
            </DialogDescription>
          </DialogHeader>

          {isSignature && (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={SIGNATURE_NAME_MAX}
              placeholder="Signature name"
              aria-label="Signature name"
            />
          )}

          <div className="flex gap-1">
            <ModeButton active={mode === "rich"} onClick={() => switchMode("rich")}>
              Rich text
            </ModeButton>
            <ModeButton active={mode === "html"} onClick={() => switchMode("html")}>
              HTML
            </ModeButton>
          </div>

          {mode === "rich" ? (
            richAllowed ? (
              <EditorContent editor={editor} />
            ) : (
              <p className="text-[12px] text-faint">
                This signature uses HTML layout (images, tables or inline styles) that rich text
                would drop. Edit it as HTML.
              </p>
            )
          ) : (
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={8}
              spellCheck={false}
              aria-label="Signature HTML"
              className="font-mono text-[12px]"
            />
          )}

          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              Preview
            </p>
            <SignaturePreview html={html} />
          </div>

          {isSignature && (
            <div className="flex flex-col gap-2 text-[13px]">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={defaultNew}
                  onCheckedChange={(v) => setDefaultNew(v)}
                  aria-label="Default for new messages"
                />
                Default for new messages
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={defaultReply}
                  onCheckedChange={(v) => setDefaultReply(v)}
                  aria-label="Default for replies and forwards"
                />
                Default for replies and forwards
              </label>
            </div>
          )}

          {error && <p className="text-[12px] text-destructive-text">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onClick}
      aria-pressed={active}
      className={cn(active ? "bg-hover text-foreground" : "text-faint")}
    >
      {children}
    </Button>
  );
}
