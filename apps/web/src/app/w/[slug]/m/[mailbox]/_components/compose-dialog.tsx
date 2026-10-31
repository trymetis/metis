"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
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
  UnderlineIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  type DrivePick,
  DrivePickerDialog,
  SHARE_LINK_PROVIDERS,
} from "@/components/drive-picker-dialog";
import { EmailFrame } from "@/components/email-frame";
import { PickTimeDialog } from "@/components/pick-time-dialog";
import { useContactSuggestions } from "@/hooks/use-contact-suggestions";
import { useMailPrivacy, useRenderedEmail } from "@/hooks/use-mail-privacy";
import { useWorkspaceMailboxes } from "@/hooks/use-mailbox-emails";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import { formatBytes } from "@/lib/utils";
import { mailboxMarkColor } from "@/mail/mailbox-color";
import type { RemoteImages } from "@/mail/render/types";
import { useMailStore } from "@/store/mail-store";
import { useUndoSendStore } from "@/store/undo-send-store";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

import { RecipientField } from "./recipient-field";

interface AttachedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentBase64: string;
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

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

function splitRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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

export function ComposeDialog() {
  const scope = useMailboxScope();
  const mailboxes = useWorkspaceMailboxes();
  const [chosenFrom, setFromMailboxSlug] = useState("");
  const { composeOpen, setComposeOpen, composeInitial, setComposeInitial } = useMailStore();
  const startSend = useUndoSendStore((s) => s.startSend);

  const fromItems = useMemo(
    () =>
      mailboxes.map((m) => ({
        value: m.slug,
        label: m.email,
        mark: mailboxMarkColor(m.email),
      })),
    [mailboxes],
  );

  const fromMailboxSlug =
    chosenFrom ||
    (mailboxes.some((m) => m.slug === scope.mailboxSlug)
      ? scope.mailboxSlug
      : (mailboxes[0]?.slug ?? ""));
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [quotedHtml, setQuotedHtml] = useState<string | null>(null);
  const [quoteImages, setQuoteImages] = useState<RemoteImages>("block");
  const [showQuoted, setShowQuoted] = useState(false);
  const privacy = useMailPrivacy();
  const quotePreview = useRenderedEmail(privacy, showQuoted ? quotedHtml : null, quoteImages);
  const threadingRef = useRef<{
    inReplyTo?: string;
    references?: string;
    replyToMessageId?: string;
  }>({});
  const contacts = useContactSuggestions(composeOpen);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [customScheduleOpen, setCustomScheduleOpen] = useState(false);
  const [pendingScheduleTime, setPendingScheduleTime] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const canLinkFromDrive =
    useQuery(
      rpc.workspaceDrives.list.queryOptions({ input: { workspaceSlug: scope.workspaceSlug } }),
    ).data?.drives.some((d) => SHARE_LINK_PROVIDERS.includes(d.provider)) ?? false;
  const titleId = useId();
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const draftIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    let runningTotal = attachedFiles.reduce((a, f) => a + f.size, 0);

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
    const next: AttachedFile[] = await Promise.all(
      accepted.map(async (file) => ({
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentBase64: await fileToBase64(file),
      })),
    );

    if (next.length > 0) setAttachedFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your message…" }),
    ],
    editorProps: {
      attributes: {
        class: "min-h-[180px] px-0 py-2 text-[14px] leading-relaxed focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && composeOpen) setComposeOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composeOpen, setComposeOpen]);

  const [seededInitial, setSeededInitial] = useState<typeof composeInitial>(null);
  if (composeOpen && composeInitial && composeInitial !== seededInitial) {
    setSeededInitial(composeInitial);
    if (composeInitial.to) setTo(splitRecipients(composeInitial.to));
    if (composeInitial.cc) {
      setCc(splitRecipients(composeInitial.cc));
      setShowCc(true);
    }
    if (composeInitial.bcc) {
      setBcc(splitRecipients(composeInitial.bcc));
      setShowBcc(true);
    }
    if (composeInitial.subject) setSubject(composeInitial.subject);
    if (composeInitial.quotedHtml) {
      setQuotedHtml(composeInitial.quotedHtml);
      setQuoteImages(composeInitial.quoteImages ?? "block");
      setShowQuoted(false);
    }
    if (composeInitial.draftId) setDraftStatus("saved");
  }

  useEffect(() => {
    if (composeOpen && composeInitial) {
      if (composeInitial.bodyHtml) editor?.commands.setContent(composeInitial.bodyHtml);
      threadingRef.current = {
        inReplyTo: composeInitial.inReplyTo,
        references: composeInitial.references,
        replyToMessageId: composeInitial.replyToMessageId,
      };
      if (composeInitial.draftId) draftIdRef.current = composeInitial.draftId;
      setComposeInitial(null);
    }
  }, [composeOpen, composeInitial, setComposeInitial, editor]);

  const setLink = useCallback(() => {
    const url = window.prompt("URL");
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const buildPayload = useCallback(() => {
    const editorHtml = editor?.getHTML() ?? "";
    const bodyHtml = quotedHtml ? `${editorHtml}<br>${quotedHtml}` : editorHtml;
    return {
      to,
      cc,
      bcc,
      subject,
      ...(threadingRef.current.inReplyTo && {
        inReplyTo: threadingRef.current.inReplyTo,
      }),
      ...(threadingRef.current.references && {
        references: threadingRef.current.references,
      }),
      ...(threadingRef.current.replyToMessageId && {
        replyToMessageId: threadingRef.current.replyToMessageId,
      }),
      bodyHtml,
      attachments: attachedFiles.map(({ filename, mimeType, contentBase64 }) => ({
        filename,
        mimeType,
        contentBase64,
      })),
    };
  }, [editor, to, cc, bcc, subject, attachedFiles, quotedHtml]);

  const saveDraftNow = useCallback(async () => {
    const bodyHtml = editor?.getHTML() ?? "";
    const subjTrim = subject.trim();
    const bodyTrim = bodyHtml.replace(/<[^>]+>/g, "").trim();
    if (to.length === 0 && !subjTrim && !bodyTrim) {
      setDraftStatus("idle");
      return;
    }
    setDraftStatus("saving");
    try {
      const data = await orpc.mail.drafts.save({
        ...scope,
        fromMailboxSlug,
        draftId: draftIdRef.current ?? undefined,
        payload: buildPayload(),
      });
      if (data.id) {
        draftIdRef.current = data.id;
      }
      setDraftStatus("saved");
    } catch {
      setDraftStatus("error");
    }
  }, [editor, subject, to, buildPayload, scope, fromMailboxSlug]);

  useEffect(() => {
    if (!composeOpen) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveDraftNow();
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [composeOpen, saveDraftNow]);

  function resetForm() {
    setComposeOpen(false);
    setTo([]);
    setCc([]);
    setBcc([]);
    setSubject("");
    setQuotedHtml(null);
    setShowQuoted(false);
    threadingRef.current = {};
    setAttachedFiles([]);
    setPendingScheduleTime(null);
    setDraftStatus("idle");
    draftIdRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    editor?.commands.clearContent();
  }

  function handleSend() {
    if (to.length === 0 || !subject.trim()) {
      setError("To and Subject are required.");
      return;
    }
    setError(null);

    const id = draftIdRef.current;
    if (id) {
      orpc.mail.drafts.delete({ ...scope, fromMailboxSlug, draftId: id }).catch(() => {});
    }
    startSend(buildPayload(), scope, fromMailboxSlug);
    resetForm();
  }

  const notifyScheduled = useUndoSendStore((s) => s.notifyScheduled);

  async function handleScheduledSend(date: Date) {
    if (to.length === 0 || !subject.trim()) {
      setError("To and Subject are required.");
      return;
    }
    setError(null);
    const payload = buildPayload();
    try {
      await orpc.mail.scheduledSend.create({
        ...scope,
        fromMailboxSlug,
        payload,
        scheduledFor: date.toISOString(),
      });
      void refreshQueries(rpc.mail.scheduledSend.list.key());
      notifyScheduled(payload, scope, date);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to schedule send");
    }
  }

  if (!composeOpen) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 max-md:p-0">
      <div
        role="presentation"
        className="pointer-events-auto absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={() => setComposeOpen(false)}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="pointer-events-auto relative w-full max-w-160 overflow-hidden rounded-[14px] border shadow-[0_30px_90px_rgba(0,0,0,0.65)] bg-surface border-border animate-[obsidian-slide-up_0.2s_ease] max-md:flex max-md:h-dvh max-md:max-w-none max-md:flex-col max-md:overflow-y-auto max-md:rounded-none max-md:border-0 max-md:[&>*]:shrink-0"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 bg-panel border-border-soft">
          <span className="flex items-center gap-3 text-[20px] font-medium tracking-tight font-serif text-foreground">
            <span id={titleId}>New Message</span>
            <DraftStatusIndicator status={draftStatus} />
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setComposeOpen(false)}
            aria-label="Close compose"
            className="text-faint"
          >
            <X />
          </Button>
        </div>

        {mailboxes.length > 0 && (
          <Field label="From">
            {mailboxes.length > 1 ? (
              <Select
                items={fromItems}
                value={fromMailboxSlug}
                onValueChange={(next) => {
                  if (next) setFromMailboxSlug(next);
                }}
              >
                <SelectTrigger className="my-1.5 h-8! border-0 bg-transparent px-0 text-[13px] shadow-none">
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
            onValuesChange={setTo}
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
              onValuesChange={setCc}
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
              onValuesChange={setBcc}
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
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line…"
            className="flex-1 bg-transparent py-3 text-[14px] outline-none text-foreground"
          />
        </Field>

        <div className="px-5 py-4 min-h-60 max-md:flex-1">
          <EditorContent editor={editor} />
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
                    setQuotedHtml(null);
                    setShowQuoted(false);
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
          {attachedFiles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3 border-border-soft">
              {attachedFiles.map((file) => (
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
                    onClick={() => removeFile(file.id)}
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

        <div className="flex items-center justify-between border-t px-4 py-3 border-border-soft max-md:sticky max-md:bottom-0 max-md:gap-2 max-md:bg-surface">
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
            <FmtBtn title="Link" active={editor?.isActive("link")} onClick={setLink}>
              <Link2 className="h-3 w-3" />
            </FmtBtn>
            <FmtBtn title="Attach files" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3 w-3" />
            </FmtBtn>
            {canLinkFromDrive && (
              <FmtBtn title="Link a file from Drive" onClick={() => setDrivePickerOpen(true)}>
                <HardDrive className="h-3 w-3" />
              </FmtBtn>
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
    </div>
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

function DraftStatusIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
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
