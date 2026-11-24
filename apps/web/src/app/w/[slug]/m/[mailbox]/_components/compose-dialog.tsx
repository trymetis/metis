"use client";

import { Button } from "@metis/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@metis/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Input } from "@metis/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@metis/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Sheet, SheetContent } from "@metis/ui/components/sheet";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { escapeText } from "entities";
import {
  Bold,
  Calendar,
  ChevronDown,
  Clock,
  HardDrive,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Send,
  Signature,
  UnderlineIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type DrivePick,
  DrivePickerDialog,
  SHARE_LINK_PROVIDERS,
} from "@/components/drive-picker-dialog";
import { EmailFrame } from "@/components/email-frame";
import { PickTimeDialog } from "@/components/pick-time-dialog";
import { useContactSuggestions } from "@/hooks/use-contact-suggestions";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useMailPrivacy, useRenderedEmail } from "@/hooks/use-mail-privacy";
import { useWorkspaceMailboxes } from "@/hooks/use-mailbox-emails";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import { formatBytes } from "@/lib/utils";
import { mailboxMarkColor } from "@/mail/mailbox-color";
import {
  type ComposeAttachment,
  type ComposeKind,
  type ComposeSession,
  composePayload,
  type DraftStatus,
  useComposeStore,
} from "@/store/compose-store";
import { useUndoSendStore } from "@/store/undo-send-store";
import type { MailSignatureKind, MailSignatureScope } from "@/types/mail";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

import { RecipientField } from "./recipient-field";
import {
  hasSignature,
  SIGNATURE_META,
  setSignature,
  SignatureBlock,
  typedText,
} from "./signature-block";

const COMPOSE_TITLES: Record<ComposeKind, string> = {
  new: "New message",
  reply: "Reply",
  forward: "Forward",
  draft: "Draft",
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const CARET_CLEARANCE_PX = 48;

const EXTENSIONS = [
  StarterKit,
  Underline,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Link.extend({ inclusive: () => false }).configure({ openOnClick: false }),
  Placeholder.configure({ placeholder: "Write your message…" }),
  SignatureBlock,
];

const EDITOR_PROPS = {
  attributes: {
    class:
      "min-h-[180px] flex-1 px-0 py-2 text-[14px] leading-relaxed focus:outline-none [&_[data-metis-signature]]:mt-3 [&_[data-metis-signature]]:rounded-sm [&_[data-metis-signature]]:text-muted-foreground [&_.ProseMirror-selectednode[data-metis-signature]]:outline-2 [&_.ProseMirror-selectednode[data-metis-signature]]:outline-ring/50",
  },
  scrollThreshold: CARET_CLEARANCE_PX,
  scrollMargin: CARET_CLEARANCE_PX,
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the file"));
        return;
      }
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function presetTime(label: string): Date {
  const d = new Date();
  if (label === "in1h") d.setHours(d.getHours() + 1);
  else if (label === "tonight") d.setHours(20, 0, 0, 0);
  else if (label === "tomorrowMorning") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (label === "mondayMorning") {
    const days = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function composeTitle(session: ComposeSession): string {
  if (session.kind === "reply" && session.replyingTo) return `Reply to ${session.replyingTo}`;
  if (session.kind === "draft" && session.references) return "Reply";
  return COMPOSE_TITLES[session.kind];
}

function initialFocus(): HTMLElement | boolean {
  const root = document.querySelector("[data-compose]");
  const kind = useComposeStore.getState().session?.kind;
  const target =
    kind === "new"
      ? root?.querySelector<HTMLElement>('[aria-label="To recipients"]')
      : root?.querySelector<HTMLElement>('[contenteditable="true"]');
  return target ?? false;
}

export function ComposeDialog() {
  const scope = useMailboxScope();
  const mailboxes = useWorkspaceMailboxes();
  const isMobile = useIsMobile();
  const session = useComposeStore((s) => s.session);
  const bind = useComposeStore((s) => s.bind);
  const close = useComposeStore((s) => s.close);
  const defaultFrom = mailboxes.some((m) => m.slug === scope.mailboxSlug)
    ? scope.mailboxSlug
    : (mailboxes[0]?.slug ?? "");

  useEffect(() => {
    bind({ scope, defaultFrom });
  }, [bind, scope, defaultFrom]);

  const open = session !== null;
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };
  const content = !session ? null : session.loading || session.loadFailed ? (
    <DraftLoading failed={session.loadFailed} />
  ) : (
    <ComposeForm key={session.id} session={session} defaultFrom={defaultFrom} />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} disablePointerDismissal>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          initialFocus={initialFocus}
          data-compose=""
          className="h-[95dvh] gap-0 overflow-hidden rounded-t-[14px] border-border bg-surface p-0 text-foreground"
        >
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        initialFocus={initialFocus}
        data-compose=""
        className="inset-0 m-auto flex h-[min(92dvh,1000px)] w-[min(1100px,calc(100vw-3rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[14px] bg-surface p-0 text-foreground shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:max-w-none"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

function ComposeHeader({ title, status }: { title: string; status?: DraftStatus }) {
  const close = useComposeStore((s) => s.close);
  return (
    <div className="flex shrink-0 items-center justify-between border-b px-5 py-3 bg-panel border-border-soft">
      <span className="flex min-w-0 items-center gap-3">
        <DialogTitle className="truncate leading-normal">{title}</DialogTitle>
        {status && <DraftStatusIndicator status={status} />}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={close}
        aria-label="Close compose"
        className="text-faint"
      >
        <X />
      </Button>
    </div>
  );
}

function DraftLoading({ failed }: { failed: boolean }) {
  return (
    <>
      <ComposeHeader title="Draft" />
      <p className={cn("px-5 py-4 text-[13px]", failed ? "text-destructive-text" : "text-faint")}>
        {failed ? "Could not load this draft." : "Loading draft…"}
      </p>
    </>
  );
}

function ComposeForm({ session, defaultFrom }: { session: ComposeSession; defaultFrom: string }) {
  const scope = useMailboxScope();
  const mailboxes = useWorkspaceMailboxes();
  const update = useComposeStore((s) => s.update);
  const setBody = useComposeStore((s) => s.setBody);
  const addAttachments = useComposeStore((s) => s.addAttachments);
  const removeAttachment = useComposeStore((s) => s.removeAttachment);
  const touch = useComposeStore((s) => s.touch);
  const markSignature = useComposeStore((s) => s.markSignature);
  const finish = useComposeStore((s) => s.finish);
  const startSend = useUndoSendStore((s) => s.startSend);
  const notifyScheduled = useUndoSendStore((s) => s.notifyScheduled);

  const fromItems = useMemo(
    () =>
      mailboxes.map((m) => ({
        value: m.slug,
        label: m.email,
        mark: mailboxMarkColor(m.email),
      })),
    [mailboxes],
  );

  const { to, cc, bcc, subject, quotedHtml, quoteImages, attachments } = session;
  const fromMailboxSlug = session.from ?? defaultFrom;
  const [showQuoted, setShowQuoted] = useState(false);
  const privacy = useMailPrivacy();
  const quotePreview = useRenderedEmail(privacy, showQuoted ? quotedHtml : null, quoteImages);
  const contacts = useContactSuggestions(true);
  const [showCc, setShowCc] = useState(cc.length > 0);
  const [showBcc, setShowBcc] = useState(bcc.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [customScheduleOpen, setCustomScheduleOpen] = useState(false);
  const [pendingScheduleTime, setPendingScheduleTime] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const canLinkFromDrive =
    useQuery(
      rpc.workspaceDrives.list.queryOptions({ input: { workspaceSlug: scope.workspaceSlug } }),
    ).data?.drives.some((d) => SHARE_LINK_PROVIDERS.includes(d.provider)) ?? false;
  const signatureKind: MailSignatureKind | null =
    session.kind === "draft" ? null : session.kind === "new" ? "new" : "reply";
  const signatures = useQuery({
    ...rpc.mail.signatures.forCompose.queryOptions({
      input: { ...scope, fromMailboxSlug: fromMailboxSlug || undefined },
    }),
    enabled: !!fromMailboxSlug,
    staleTime: 60_000,
  }).data;

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: session.bodyHtml,
    autofocus: session.kind === "new" ? false : "start",
    editorProps: EDITOR_PROPS,
    onUpdate: ({ editor: current, transaction }) =>
      setBody(
        current.getHTML(),
        typedText(current) !== "",
        transaction.getMeta(SIGNATURE_META) !== true,
      ),
    immediatelyRender: false,
  });

  const appliedSignature = session.signature;
  useEffect(() => {
    if (!editor || !signatures) return;
    const preferredId = signatureKind === "reply" ? signatures.defaultReply : signatures.defaultNew;
    const preferred = signatures.signatures.find((s) => s.id === preferredId) ?? null;
    if (!appliedSignature) {
      const auto = signatureKind !== null && !hasSignature(editor);
      if (auto && preferred) setSignature(editor, preferred);
      markSignature({ from: fromMailboxSlug, auto });
      return;
    }
    if (appliedSignature.from === fromMailboxSlug) return;
    markSignature({ from: fromMailboxSlug, auto: appliedSignature.auto });
    if (hasSignature(editor) || appliedSignature.auto) setSignature(editor, preferred);
  }, [editor, signatures, signatureKind, fromMailboxSlug, appliedSignature, markSignature]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    let runningTotal = attachments.reduce((a, f) => a + f.size, 0);

    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" exceeds 25 MB`);
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        setError("Total attachments exceed 25 MB");
        break;
      }
      runningTotal += file.size;
      accepted.push(file);
    }
    const next: ComposeAttachment[] = await Promise.all(
      accepted.map(async (file) => ({
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentBase64: await fileToBase64(file),
      })),
    );

    if (next.length > 0) addAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function linkDriveFile(pick: DrivePick) {
    setDrivePickerOpen(false);
    try {
      const entry = await orpc.drive.get({
        workspaceSlug: scope.workspaceSlug,
        driveSlug: ALL_DRIVES_SLUG,
        fileId: pick.folderId,
      });
      if (!entry.webUrl) {
        setError("That file has no shareable link at its provider");
        return;
      }
      editor
        ?.chain()
        .focus()
        .insertContent(
          `<p><a href="${entry.webUrl}" rel="noopener noreferrer">${escapeText(entry.name)}</a></p>`,
        )
        .run();
    } catch {
      setError("Could not read that file");
    }
  }

  function handleSend() {
    if (to.length === 0 || !subject.trim()) {
      setError("To and Subject are required.");
      return;
    }
    setError(null);
    startSend(composePayload(session), scope, fromMailboxSlug, {
      kind: session.kind,
      replyingTo: session.replyingTo,
    });
    finish("delete");
  }

  async function handleScheduledSend(date: Date) {
    if (to.length === 0 || !subject.trim()) {
      setError("To and Subject are required.");
      return;
    }
    setError(null);
    const payload = composePayload(session);
    try {
      const { addedBcc } = await orpc.mail.scheduledSend.create({
        ...scope,
        fromMailboxSlug,
        payload,
        scheduledFor: date.toISOString(),
      });
      void refreshQueries(rpc.mail.scheduledSend.list.key());
      notifyScheduled(payload, scope, date, addedBcc);
      finish("keep");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule send");
    }
  }

  return (
    <>
      <ComposeHeader title={composeTitle(session)} status={session.status} />

      <div className="shrink-0">
        {mailboxes.length > 0 && (
          <Field label="From">
            {mailboxes.length > 1 ? (
              <Select
                items={fromItems}
                value={fromMailboxSlug}
                disabled={session.draftId !== null}
                onValueChange={(next) => {
                  if (next) update({ from: next });
                }}
              >
                <SelectTrigger
                  title={
                    session.draftId !== null
                      ? "From can't change once the draft is saved"
                      : undefined
                  }
                  className="my-1.5 h-8! border-0 bg-transparent px-0 text-[13px] shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fromItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span
                        aria-hidden
                        className="mr-2 inline-block size-2 shrink-0 rounded-full align-middle"
                        style={{ background: item.mark }}
                      />
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="block py-2.5 font-mono text-[13px] text-muted-foreground">
                {/* oxlint-disable-next-line typescript/no-non-null-assertion --this branch is length === 1 */}
                {mailboxes[0]!.email}
              </span>
            )}
          </Field>
        )}

        <Field label="To">
          <RecipientField
            values={to}
            onValuesChange={(next) => update({ to: next })}
            contacts={contacts}
            placeholder="recipient@email.com"
            ariaLabel="To recipients"
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowCc(!showCc)}
            className={cn(
              "text-[11px] uppercase tracking-wider",
              showCc ? "text-primary hover:text-primary" : "text-faint",
            )}
          >
            Cc
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowBcc(!showBcc)}
            className={cn(
              "text-[11px] uppercase tracking-wider",
              showBcc ? "text-primary hover:text-primary" : "text-faint",
            )}
          >
            Bcc
          </Button>
        </Field>

        {showCc && (
          <Field label="Cc">
            <RecipientField
              values={cc}
              onValuesChange={(next) => update({ cc: next })}
              contacts={contacts}
              placeholder="cc@email.com"
              ariaLabel="Cc recipients"
            />
          </Field>
        )}

        {showBcc && (
          <Field label="Bcc">
            <RecipientField
              values={bcc}
              onValuesChange={(next) => update({ bcc: next })}
              contacts={contacts}
              placeholder="bcc@email.com"
              ariaLabel="Bcc recipients"
            />
          </Field>
        )}

        <Field label="Subject">
          <input
            type="text"
            value={subject}
            onChange={(e) => update({ subject: e.target.value })}
            placeholder="Subject line…"
            className="flex-1 bg-transparent py-3 text-[14px] outline-none text-foreground"
          />
        </Field>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        <EditorContent editor={editor} className="flex flex-1 flex-col" />
        {quotedHtml && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setShowQuoted((s) => !s)}
                aria-expanded={showQuoted}
                className="rounded-full bg-surface text-[11px] text-muted-foreground dark:bg-surface"
              >
                <ChevronDown
                  className={cn("size-3 transition-transform", showQuoted && "rotate-180")}
                />
                {showQuoted ? "Hide quoted text" : "Show quoted text"}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setShowQuoted(false);
                  update({ quotedHtml: null });
                }}
                title="Remove quoted text"
                aria-label="Remove quoted text"
                className="rounded-full text-faint hover:text-muted-foreground"
              >
                <X />
              </Button>
            </div>
            {showQuoted && quotePreview && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-3 border-border-soft bg-surface">
                <EmailFrame
                  html={quotePreview.html}
                  images={quoteImages}
                  proxyEndpoint={privacy.proxyEndpoint}
                  adaptive={quotePreview.adaptive}
                  title="Quoted message"
                />
              </div>
            )}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-3 border-border-soft">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 bg-panel border-border"
              >
                <Paperclip className="h-3 w-3 text-primary" />
                <div className="flex flex-col">
                  <span className="max-w-50 truncate text-[12px] text-foreground">
                    {file.filename}
                  </span>
                  <span className="text-[10px] text-faint">{formatBytes(file.size)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeAttachment(file.id)}
                  className="ml-1 text-faint"
                  aria-label={`Remove ${file.filename}`}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t px-4 py-2 text-[12px] bg-destructive/8 border-destructive/20 text-destructive-text">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-t px-4 py-3 border-border-soft shrink-0 max-md:gap-2">
        <div className="flex gap-0.5 max-md:min-w-0 max-md:overflow-x-auto">
          <FmtBtn
            title="Bold"
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3 w-3" strokeWidth={2.5} />
          </FmtBtn>
          <FmtBtn
            title="Italic"
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3 w-3" strokeWidth={2.5} />
          </FmtBtn>
          <FmtBtn
            title="Underline"
            active={editor?.isActive("underline")}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-3 w-3" strokeWidth={2.5} />
          </FmtBtn>
          <FmtBtn
            title="Bullet list"
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="h-3 w-3" />
          </FmtBtn>
          <FmtBtn
            title="Numbered list"
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-3 w-3" />
          </FmtBtn>
          <LinkButton editor={editor} />
          <FmtBtn title="Attach files" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-3 w-3" />
          </FmtBtn>
          {canLinkFromDrive && (
            <FmtBtn title="Link a file from Drive" onClick={() => setDrivePickerOpen(true)}>
              <HardDrive className="h-3 w-3" />
            </FmtBtn>
          )}
          {signatures && signatures.signatures.length > 0 && (
            <SignaturePicker
              signatures={signatures.signatures}
              onPick={(picked) => {
                if (!editor) return;
                markSignature({ from: fromMailboxSlug, auto: picked !== null });
                setSignature(editor, picked);
                touch();
              }}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        <div className="flex items-center gap-2">
          {pendingScheduleTime && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setPendingScheduleTime(null)}
              className="text-[11px] text-faint"
              title="Clear schedule — send immediately"
            >
              <X />
              Cancel schedule
            </Button>
          )}
          <div className="flex overflow-hidden rounded-md bg-primary">
            <Button
              variant="ghost"
              onClick={() => {
                if (pendingScheduleTime) void handleScheduledSend(pendingScheduleTime);
                else handleSend();
              }}
              className="h-9 rounded-none px-5 text-[13px] text-primary-foreground hover:bg-black/5"
            >
              {pendingScheduleTime ? (
                <>
                  <Clock className="h-3.5 w-3.5" />
                  Send{" "}
                  {pendingScheduleTime.toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </>
              )}
            </Button>
            <div className="w-px bg-black/15" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    aria-label="Schedule send"
                    className="h-9 rounded-none px-2 text-primary-foreground hover:bg-black/5"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-[1.5px] text-faint">
                  Schedule send
                </div>
                <DropdownMenuItem onClick={() => setPendingScheduleTime(presetTime("in1h"))}>
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  In 1 hour
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPendingScheduleTime(presetTime("tonight"))}>
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  Tonight (8 PM)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPendingScheduleTime(presetTime("tomorrowMorning"))}
                >
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  Tomorrow 9 AM
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPendingScheduleTime(presetTime("mondayMorning"))}
                >
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  Monday 9 AM
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCustomScheduleOpen(true)}>
                  <Calendar className="mr-2 h-3.5 w-3.5" />
                  Pick date & time…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {customScheduleOpen && (
        <PickTimeDialog
          title="Schedule send"
          label="When to send"
          preview="Will send"
          confirmLabel="Confirm scheduled send"
          onClose={() => setCustomScheduleOpen(false)}
          onConfirm={(date) => {
            setCustomScheduleOpen(false);
            setPendingScheduleTime(date);
          }}
        />
      )}

      <DrivePickerDialog
        open={drivePickerOpen}
        onOpenChange={setDrivePickerOpen}
        title="Link a file from Drive"
        description="Pick a file. Its provider link is inserted into the message — the file itself is not attached."
        confirmLabel="Insert link"
        mode="file"
        providers={SHARE_LINK_PROVIDERS}
        onPick={linkDriveFile}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-soft px-5">
      <label className="w-16 shrink-0 text-[11px] uppercase tracking-[1.2px] text-faint">
        {label}
      </label>
      {children}
    </div>
  );
}

function FmtBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      title={title}
      className={cn(active ? "bg-hover text-foreground" : "text-faint")}
    >
      {children}
    </Button>
  );
}

const SCOPE_LABEL: Record<MailSignatureScope, string> = {
  personal: "Yours",
  mailbox: "Mailbox",
  workspace: "Workspace",
};

function SignaturePicker({
  signatures,
  onPick,
}: {
  signatures: { id: string; scope: MailSignatureScope; name: string; html: string }[];
  onPick: (signature: { id: string; html: string } | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" title="Signature" className="text-faint" />}
      >
        <Signature className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        {signatures.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => onPick(s)}>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-faint">
              {SCOPE_LABEL[s.scope]}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onPick(null)}>No signature</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function linkHref(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return value;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[\d\s().-]{6,}$/.test(value)) return `tel:${value.replace(/[\s().-]/g, "")}`;
  return `https://${value}`;
}

function LinkButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [invalid, setInvalid] = useState(false);
  const onLink = editor?.isActive("link") ?? false;

  function openChange(next: boolean) {
    if (next) {
      const href: unknown = editor?.getAttributes("link").href;
      setAddress(typeof href === "string" ? href : "");
      setInvalid(false);
    }
    setOpen(next);
  }

  function remove() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  }

  function apply() {
    if (!editor) return;
    const value = address.trim();
    if (!value) {
      remove();
      return;
    }
    const href = linkHref(value);
    if (!editor.can().setLink({ href })) {
      setInvalid(true);
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !onLink) {
      chain
        .insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="Link"
            className={cn(onLink ? "bg-hover text-foreground" : "text-faint")}
          />
        }
      >
        <Link2 className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Input
            autoFocus
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setInvalid(false);
            }}
            placeholder="https://example.com"
            aria-label="Link address"
            aria-invalid={invalid || undefined}
            className="h-8 text-[12px]"
          />
          {invalid && (
            <p className="text-[11px] text-destructive-text">Use a web, email or phone address.</p>
          )}
          <div className="flex justify-end gap-2">
            {onLink && (
              <Button type="button" variant="outline" size="sm" onClick={remove}>
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function DraftStatusIndicator({ status }: { status: DraftStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving draft…"
      : status === "saved"
        ? "Draft saved"
        : "Couldn't save draft";
  return (
    <span
      className={cn(
        "text-[11px] font-normal font-sans",
        status === "error" ? "text-destructive-text" : "text-faint",
      )}
    >
      {label}
    </span>
  );
}
