"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button, buttonVariants } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@metis/ui/components/hover-card";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { cva } from "class-variance-authority";
import {
  BookUser,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Download,
  FileCode,
  Forward,
  HardDriveDownload,
  HeartHandshake,
  Loader2,
  Mail,
  MailX,
  MessageCircleQuestion,
  Paperclip,
  Pencil,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Star,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { viewerTimeZone } from "@/ai/turn";
import { PersonMenu, SavedBadge } from "@/components/contacts/person-menu";
import { useSaveContact } from "@/components/contacts/use-save-contact";
import { type DrivePick, DrivePickerDialog } from "@/components/drive-picker-dialog";
import { IconButton } from "@/components/icon-button";
import { PersonAvatar } from "@/components/person-avatar";
import { PickTimeDialog } from "@/components/pick-time-dialog";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";
import { base64ToBlob, uploadToDrive } from "@/drive/upload-client";
import { useCurrentEmails } from "@/hooks/use-current-emails";
import { useCustomLabels } from "@/hooks/use-custom-labels";
import {
  type MessageBody,
  type ThreadBody,
  type ThreadMessage,
  useAttachments,
  useEmailBody,
  usePhishingAnalysis,
  useSmartReplies,
  useThread,
  useThreadBodies,
  useThreadSummary,
  useUnsubscribeInfo,
} from "@/hooks/use-email-detail";
import { type MailPrivacy, useMailPrivacy, useRenderedEmail } from "@/hooks/use-mail-privacy";
import { useReplyActions } from "@/hooks/use-reply-actions";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { inOrder } from "@/lib/in-order";
import { orpc, rpc } from "@/lib/orpc";
import { formatBytes, formatRelativeDate } from "@/lib/utils";
import { customLabelMark, LABEL_OPTIONS } from "@/mail/label-meta";
import { showLabelUndo } from "@/mail/label-undo";
import {
  mutedThreads,
  readLater,
  setCachedLabels,
  useMailLabels,
  useMutedThreadIds,
  useReadLaterIds,
} from "@/mail/mail-cache";
import { cleanUrl as cleanTrackedUrl } from "@/mail/render/pipeline";
import type { RemoteImages } from "@/mail/render/types";
import type {
  AnalysisResultOutput,
  ContactDraft,
  ContactMatch,
  ThreadSummaryOutput,
} from "@/server/schema";
import { useComposeStore } from "@/store/compose-store";
import { useMailStore } from "@/store/mail-store";
import type { Attachment } from "@/types/mail";
import { ALL_DRIVES_SLUG, mailPath } from "@/workspace/path";

import { MessageContent, RemoteImagesChip } from "./message-content";
import { type SummaryActions, ThreadSummaryCards } from "./thread-summary";
import { TrackerBadge } from "./tracker-badge";

const SKELETON_WIDTHS = [92, 78, 97, 64, 85];

const SNOOZE_PRESETS: { label: string; when: () => Date }[] = [
  {
    label: "Later today (+3 hrs)",
    when: () => new Date(Date.now() + 3 * 60 * 60 * 1000),
  },
  {
    label: "Tomorrow 9 AM",
    when: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "This weekend (Sat 9 AM)",
    when: () => {
      const d = new Date();
      const diff = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next week (Mon 9 AM)",
    when: () => {
      const d = new Date();
      const diff = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

const REPLY_STANCES = [
  { key: "accept", label: "Accept" },
  { key: "decline", label: "Polite decline" },
  { key: "negotiate", label: "Negotiate" },
  { key: "buy_time", label: "Buy time" },
  { key: "clarify", label: "Clarify" },
  { key: "defer", label: "Defer" },
] as const;

function RecipientLine({
  label,
  recipients,
  matches,
  onSave,
}: {
  label: string;
  recipients: { email: string; name?: string }[];
  matches: Map<string, ContactMatch>;
  onSave: (draft: ContactDraft) => void;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-6 shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {recipients.map((r) => (
          <div key={`${r.email}-${r.name ?? ""}`} className="flex min-w-0 items-center gap-1">
            <PersonMenu
              email={r.email}
              name={r.name}
              match={matches.get(r.email.toLowerCase())}
              onSave={onSave}
            >
              {r.name && <span className="text-[12px] text-muted-foreground">{r.name} </span>}
              <span className="break-all font-mono text-[11px] text-faint">{r.email}</span>
            </PersonMenu>
            {matches.has(r.email.toLowerCase()) && (
              <BookUser aria-label="Saved contact" className="size-3 shrink-0 text-brand-text" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function downloadBase64File(data: string, filename: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function EmailDetail() {
  const scope = useMailboxScope();
  const {
    selectedEmail,
    isFetchingBody,
    setSelectedEmail,
    updateEmail,
    removeEmail,
    visibleEmailIds,
  } = useMailStore();
  const openDraft = useComposeStore((s) => s.openDraft);
  const { reply, replyAll, forward } = useReplyActions(selectedEmail);
  const emails = useCurrentEmails();
  const { labels } = useMailLabels(scope);
  const customLabels = useCustomLabels();
  const mutedThreadIds = useMutedThreadIds(scope);
  const readLaterIds = useReadLaterIds(scope);
  const setLabelFor = (messageId: string, label: string) =>
    setCachedLabels(scope, (current) => ({ ...current, [messageId]: { label, confidence: 100 } }));
  const muteThreadLocal = (threadId: string) => mutedThreads.add(scope, threadId);
  const unmuteThreadLocal = (threadId: string) => mutedThreads.remove(scope, threadId);
  const addReadLaterLocal = (id: string) => readLater.add(scope, id);
  const removeReadLaterLocal = (id: string) => readLater.remove(scope, id);

  const currentIndex = selectedEmail ? visibleEmailIds.indexOf(selectedEmail.id) : -1;
  const prevId = currentIndex > 0 ? visibleEmailIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < visibleEmailIds.length - 1
      ? visibleEmailIds[currentIndex + 1]
      : null;

  async function navigateTo(id: string | null | undefined) {
    if (!id) return;
    const target = emails.find((e) => e.id === id);
    if (!target) return;
    setSelectedEmail(target);
    if (!target.isRead) {
      updateEmail(target.id, { isRead: true });
      try {
        await orpc.mail.messages.markRead({
          ...scope,
          ids: [target.id],
          read: true,
        });
      } catch {}
    }
  }

  const { phishingDetection: phishingDetectionEnabled, ai: scopeAi } = useScopePolicy();
  const workspaceMailboxes = useQuery(
    rpc.workspaceMailboxes.list.queryOptions({ input: { workspaceSlug: scope.workspaceSlug } }),
  ).data?.mailboxes;
  const messageMailbox = selectedEmail?.mailboxId
    ? workspaceMailboxes?.find((m) => m.mailboxId === selectedEmail.mailboxId)
    : undefined;
  const aiEnabled = usePlatformPolicy().ai && (messageMailbox ? messageMailbox.policy.ai : scopeAi);
  const saveContact = useSaveContact();
  const contactAddresses = useMemo(
    () =>
      selectedEmail
        ? [
            ...new Set(
              [selectedEmail.from, ...selectedEmail.to, ...(selectedEmail.cc ?? [])]
                .map((address) => address.trim().toLowerCase())
                .filter((address) => address.includes("@")),
            ),
          ].slice(0, 200)
        : [],
    [selectedEmail],
  );
  const contactLookup = useQuery({
    ...rpc.contacts.lookup.queryOptions({
      input: { workspaceSlug: scope.workspaceSlug, emails: contactAddresses },
    }),
    enabled: contactAddresses.length > 0,
    staleTime: 60_000,
  });
  const contactMatches = useMemo(
    () => new Map((contactLookup.data?.matches ?? []).map((m) => [m.email, m])),
    [contactLookup.data],
  );
  const senderMatch = selectedEmail
    ? contactMatches.get(selectedEmail.from.toLowerCase())
    : undefined;
  const { body } = useEmailBody(selectedEmail);
  const privacy = useMailPrivacy();
  const images: RemoteImages = selectedEmail
    ? privacy.imagesFor(selectedEmail.from, selectedEmail.id)
    : "block";
  const rendered = useRenderedEmail(privacy, body?.kind === "html" ? body.html : null, images);
  const hasBody = body?.kind === "html" || body?.kind === "text";
  const linkRules = privacy.cleanLinks ? (privacy.rules?.links ?? null) : null;
  const cleanSummaryUrl = useMemo(
    () => (linkRules ? (url: string) => cleanTrackedUrl(url, linkRules) : undefined),
    [linkRules],
  );
  const {
    result: analysis,
    loading: analysisLoading,
    error: analysisError,
  } = usePhishingAnalysis(selectedEmail?.id, phishingDetectionEnabled);
  const {
    result: summary,
    loading: summaryLoading,
    error: summaryError,
  } = useThreadSummary(selectedEmail, aiEnabled);
  const attachments = useAttachments(selectedEmail?.id);
  const {
    messages: threadMessages,
    expanded: expandedThread,
    setExpanded: setExpandedThread,
  } = useThread(selectedEmail?.id, selectedEmail?.threadId);
  const threadBodies = useThreadBodies(selectedEmail?.id, expandedThread);
  const { replies: smartReplies, loading: smartRepliesLoading } = useSmartReplies(
    selectedEmail,
    aiEnabled,
  );
  const {
    methods: unsubMethods,
    limited: unsubLimited,
    status: unsubStatus,
    setStatus: setUnsubStatus,
  } = useUnsubscribeInfo(selectedEmail);
  const [unsubBusy, setUnsubBusy] = useState(false);
  const [saveTarget, setSaveTarget] = useState<{
    messageId: string;
    att: Attachment;
  } | null>(null);
  const [savingAttachment, setSavingAttachment] = useState<string | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [apologyOpen, setApologyOpen] = useState(false);
  const [snoozePickerOpen, setSnoozePickerOpen] = useState(false);
  const [apologySituation, setApologySituation] = useState("");
  const [apologyTone, setApologyTone] = useState<"brief" | "warm" | "formal">("warm");
  const [apologyLoading, setApologyLoading] = useState(false);
  const [apologyError, setApologyError] = useState<string | null>(null);
  const [stanceLoading, setStanceLoading] = useState<string | null>(null);
  const [bodyCapped, setBodyCapped] = useState(false);
  const [blockedImages, setBlockedImages] = useState(0);
  const [bodyOverflows, setBodyOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);

  const [shownEmailId, setShownEmailId] = useState(selectedEmail?.id);
  if (selectedEmail?.id !== shownEmailId) {
    setShownEmailId(selectedEmail?.id);
    setApologyOpen(false);
    setApologySituation("");
    setApologyTone("warm");
    setApologyError(null);
    setStanceLoading(null);
    setUnsubBusy(false);
    setRecipientsExpanded(false);
  }

  useEffect(() => {
    const viewport = scrollContentRef.current?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) viewport.scrollTop = 0;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- selectedEmail?.id is the intended trigger — collapse the analysis panel whenever the open email changes.
  }, [selectedEmail?.id]);

  const measureDeps = [body, rendered, isFetchingBody, selectedEmail?.id] as const;
  const [measuredDeps, setMeasuredDeps] = useState(measureDeps);
  if (measureDeps.some((dep, i) => dep !== measuredDeps[i])) {
    setMeasuredDeps(measureDeps);
    setBodyOverflows(false);
    setBodyCapped(false);
  }

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let decided = false;
    const observer = new ResizeObserver(() => {
      if (el.offsetHeight <= 1100) return;
      setBodyOverflows(true);
      if (!decided) {
        decided = true;
        setBodyCapped(true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- remeasure overflow per email and whenever the body content lands.
  }, [body, rendered, isFetchingBody, selectedEmail?.id]);

  async function changeLabel(newLabel: string, newLabelName: string) {
    if (!selectedEmail) return;
    const previousLabel = labels[selectedEmail.id]?.label ?? null;
    const messageId = selectedEmail.id;
    setLabelFor(messageId, newLabel);
    try {
      await orpc.mail.labels.setOnMessage({
        ...scope,
        id: messageId,
        label: newLabel,
      });
      showLabelUndo(newLabelName, [{ id: messageId, previousLabel }], scope);
    } catch {}
  }

  async function handleDelete() {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    setConfirmDeleteOpen(false);
    const request = orpc.mail.messages.delete({ ...scope, id });
    removeEmail(id, request);
    try {
      await request;
    } catch {}
  }

  async function handleArchive() {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    const request = orpc.mail.messages.archive({ ...scope, id });
    removeEmail(id, request);
    try {
      await request;
    } catch {}
  }

  async function handleRestore() {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    const request = orpc.mail.messages.restore({ ...scope, id });
    removeEmail(id, request);
    try {
      await request;
    } catch {}
  }

  function handleEditDraft() {
    if (!selectedEmail) return;

    openDraft(scope, selectedEmail);
  }

  function handleShowEmail() {
    setBodyCapped(false);
    bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSnooze(wakeAt: Date) {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    const request = orpc.mail.messages.snooze({
      ...scope,
      id,
      folder: selectedEmail.folder,
      wakeAt: wakeAt.toISOString(),
    });
    removeEmail(id, request);
    try {
      await request;
    } catch {}
  }

  async function handleToggleReadLater() {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    const isSaved = readLaterIds.has(id);
    if (isSaved) {
      removeReadLaterLocal(id);
      try {
        await inOrder(`read-later:${id}`, () =>
          orpc.mail.readLater.remove({ ...scope, messageId: id }),
        );
      } catch {}
    } else {
      addReadLaterLocal(id);
      try {
        await inOrder(`read-later:${id}`, () =>
          orpc.mail.readLater.add({ ...scope, messageId: id }),
        );
      } catch {}
    }
  }

  async function handleToggleMute() {
    if (!selectedEmail?.threadId) return;
    const tid = selectedEmail.threadId;
    const isMuted = mutedThreadIds.has(tid);
    if (isMuted) {
      unmuteThreadLocal(tid);
      try {
        await inOrder(`mute:${tid}`, () => orpc.mail.mute.remove({ ...scope, threadIds: [tid] }));
      } catch {}
    } else {
      muteThreadLocal(tid);
      try {
        await inOrder(`mute:${tid}`, () => orpc.mail.mute.add({ ...scope, threadIds: [tid] }));
      } catch {}
    }
  }

  async function handleDraftApology() {
    if (!selectedEmail || !apologySituation.trim()) return;
    setApologyLoading(true);
    setApologyError(null);
    try {
      const res = await orpc.ai.draftApology({
        ...scope,
        messageId: selectedEmail.id,
        situation: apologySituation.trim(),
        tone: apologyTone,
      });
      setApologyOpen(false);
      setApologySituation("");
      reply(res.bodyHtml);
    } catch (err) {
      setApologyError(err instanceof Error ? err.message : "Failed to draft apology");
    } finally {
      setApologyLoading(false);
    }
  }

  async function handleDraftStance(
    stance: "decline" | "accept" | "negotiate" | "buy_time" | "clarify" | "defer",
  ) {
    if (!selectedEmail) return;
    setStanceLoading(stance);
    try {
      const res = await orpc.ai.draftStance({
        ...scope,
        messageId: selectedEmail.id,
        stance,
      });
      reply(res.bodyHtml);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't draft that reply");
    } finally {
      setStanceLoading(null);
    }
  }

  async function handleStar() {
    if (!selectedEmail) return;
    const next = !selectedEmail.isStarred;
    updateEmail(selectedEmail.id, { isStarred: next });
    await orpc.mail.messages.star({
      ...scope,
      id: selectedEmail.id,
      starred: next,
    });
  }

  async function handleUnsubscribe() {
    if (!selectedEmail || unsubBusy) return;
    setUnsubBusy(true);
    try {
      const res = await orpc.mail.subscriptions.unsubscribe({
        ...scope,
        items: [{ senderEmail: selectedEmail.from, messageId: selectedEmail.id }],
      });
      const result = res.results[0];
      if (!result) return;
      if (result.status === "manual" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setUnsubStatus(result.status);
    } catch (err) {
      setUnsubStatus("failed");
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't unsubscribe");
    } finally {
      setUnsubBusy(false);
    }
  }

  async function handleDownloadAttachment(messageId: string, att: Attachment) {
    setDownloadingAttachment(attachmentKey(messageId, att));
    try {
      const file = await orpc.mail.attachments.download({
        ...scope,
        id: messageId,
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
      });
      downloadBase64File(file.data, file.filename, file.mimeType);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Couldn't download ${att.filename}`);
    } finally {
      setDownloadingAttachment(null);
    }
  }

  async function handleSaveToDrive(pick: DrivePick) {
    if (!saveTarget) return;
    const { messageId, att } = saveTarget;
    setSaveTarget(null);
    setSavingAttachment(attachmentKey(messageId, att));

    try {
      const file = await orpc.mail.attachments.download({
        ...scope,
        id: messageId,
        attachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
      });
      const blob = base64ToBlob(file.data, file.mimeType);

      const session = await orpc.drive.beginUpload({
        workspaceSlug: scope.workspaceSlug,
        driveSlug: ALL_DRIVES_SLUG,
        parentId: pick.folderId,
        name: file.filename,
        size: blob.size,
        mime: file.mimeType,
      });

      await uploadToDrive(session, blob, file.filename);
      toast.success(`Saved ${file.filename} to ${pick.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that attachment");
    } finally {
      setSavingAttachment(null);
    }
  }

  if (!selectedEmail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background text-faint">
        <Mail className="h-12 w-12 opacity-30" strokeWidth={1.2} />
        <p className="text-lg tracking-tight">Select a message to read</p>
      </div>
    );
  }

  const fromEmail = selectedEmail.from;
  const fromName = selectedEmail.fromName || selectedEmail.from;
  const toRecipients =
    selectedEmail.toRecipients ?? selectedEmail.to.map((email) => ({ email, name: undefined }));
  const ccRecipients =
    selectedEmail.ccRecipients ??
    (selectedEmail.cc ?? []).map((email) => ({ email, name: undefined }));

  const activeLabelKey = labels[selectedEmail.id]?.label;
  const activeLabelName = activeLabelKey
    ? (LABEL_OPTIONS.find((o) => o.key === activeLabelKey)?.name ??
      customLabels.find((c) => c.key === activeLabelKey)?.name ??
      "Label")
    : "Label";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div
        role="toolbar"
        aria-label="Message actions"
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-3 md:gap-2 md:px-6 border-border-soft"
      >
        <IconToolBtn label="Back" onClick={() => setSelectedEmail(null)}>
          <ChevronLeft className="size-3.5" strokeWidth={2} />
        </IconToolBtn>
        <IconToolBtn label="Previous message" onClick={() => navigateTo(prevId)} disabled={!prevId}>
          <ChevronUp className="size-3.5" strokeWidth={2} />
        </IconToolBtn>
        <IconToolBtn label="Next message" onClick={() => navigateTo(nextId)} disabled={!nextId}>
          <ChevronDown className="size-3.5" strokeWidth={2} />
        </IconToolBtn>
        {selectedEmail.folder === "drafts" ? (
          <ToolBtn onClick={handleEditDraft}>
            <Pencil className="size-3.25" strokeWidth={2} />
            Edit draft
          </ToolBtn>
        ) : (
          <>
            <IconToolBtn label="Reply" onClick={() => reply()}>
              <Reply className="size-3.5" strokeWidth={2} />
            </IconToolBtn>
            {selectedEmail.to.length + (selectedEmail.cc?.length ?? 0) > 1 && (
              <IconToolBtn label="Reply all" onClick={replyAll}>
                <ReplyAll className="size-3.5" strokeWidth={2} />
              </IconToolBtn>
            )}
            <IconToolBtn label="Forward" onClick={forward}>
              <Forward className="size-3.5" strokeWidth={2} />
            </IconToolBtn>
          </>
        )}

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label="Change label"
                className="bg-transparent text-muted-foreground dark:bg-transparent"
              >
                <TagIcon className="size-3.25" strokeWidth={2} />
                {activeLabelName}
                <ChevronDown className="size-2.75" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-[1.5px] text-faint">
              Built-in
            </div>
            {LABEL_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.key} onClick={() => changeLabel(opt.key, opt.name)}>
                <TagIcon className="mr-2 h-3 w-3" strokeWidth={2} style={{ color: opt.mark }} />
                {opt.name}
              </DropdownMenuItem>
            ))}
            {customLabels.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-[1.5px] text-faint">
                  Custom
                </div>
                {customLabels.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => changeLabel(c.key, c.name)}>
                    <TagIcon
                      className="mr-2 h-3 w-3"
                      strokeWidth={2}
                      style={{ color: customLabelMark(c.color) }}
                    />
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <IconToolBtn label={selectedEmail.isStarred ? "Starred" : "Star"} onClick={handleStar}>
          <Star
            className="size-3.5"
            strokeWidth={2}
            fill={selectedEmail.isStarred ? "var(--brand)" : "none"}
            color={selectedEmail.isStarred ? "var(--brand)" : "currentColor"}
          />
        </IconToolBtn>
        <ToolBtn onClick={handleToggleReadLater}>
          {readLaterIds.has(selectedEmail.id) ? (
            <>
              <BookmarkCheck className="size-3.25" strokeWidth={2} />
              Saved
            </>
          ) : (
            <>
              <Bookmark className="size-3.25" strokeWidth={2} />
              Read later
            </>
          )}
        </ToolBtn>
        {(unsubMethods.length > 0 || unsubLimited) && (
          <ToolBtn
            onClick={handleUnsubscribe}
            disabled={
              Boolean(unsubLimited) ||
              unsubBusy ||
              unsubStatus === "done" ||
              unsubStatus === "manual"
            }
            title={
              unsubLimited
                ? unsubLimited
                : unsubStatus === "done"
                  ? "You unsubscribed from this sender"
                  : unsubStatus === "manual"
                    ? "We opened their unsubscribe page — finish it there"
                    : unsubStatus === "failed"
                      ? "Unsubscribe failed — click to retry"
                      : "Unsubscribe from this sender"
            }
          >
            {unsubBusy ? (
              <Loader2 className="size-3.25 animate-spin" strokeWidth={2} />
            ) : (
              <MailX className="size-3.25" strokeWidth={2} />
            )}
            {unsubStatus === "done" || unsubStatus === "manual" ? "Unsubscribed" : "Unsubscribe"}
          </ToolBtn>
        )}
        {selectedEmail.threadId && (
          <ToolBtn onClick={handleToggleMute}>
            {mutedThreadIds.has(selectedEmail.threadId) ? (
              <>
                <Bell className="size-3.25" strokeWidth={2} />
                Unmute
              </>
            ) : (
              <>
                <BellOff className="size-3.25" strokeWidth={2} />
                Mute
              </>
            )}
          </ToolBtn>
        )}

        {selectedEmail.folder !== "trash" && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Snooze"
                  className="bg-transparent text-muted-foreground dark:bg-transparent"
                >
                  <Clock className="size-3.25" strokeWidth={2} />
                  Snooze
                  <ChevronDown className="size-2.75" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              {SNOOZE_PRESETS.map((p) => (
                <DropdownMenuItem key={p.label} onClick={() => handleSnooze(p.when())}>
                  <Clock className="mr-2 h-3 w-3" strokeWidth={2} />
                  {p.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSnoozePickerOpen(true)}>
                <Calendar className="mr-2 h-3 w-3" strokeWidth={2} />
                Pick date & time…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {selectedEmail.folder === "trash" ? (
          <ToolBtn onClick={handleRestore}>
            <ArchiveRestore className="size-3.25" strokeWidth={2} />
            Restore
          </ToolBtn>
        ) : (
          <IconToolBtn label="Archive" onClick={handleArchive}>
            <Archive className="size-3.5" strokeWidth={2} />
          </IconToolBtn>
        )}
        <IconToolBtn label="Delete" danger onClick={() => setConfirmDeleteOpen(true)}>
          <Trash2 className="size-3.5" strokeWidth={2} />
        </IconToolBtn>

        {aiEnabled && selectedEmail.folder !== "drafts" && (
          <ToolBtn onClick={() => setApologyOpen(true)}>
            <HeartHandshake className="size-3.25" strokeWidth={2} />
            Draft apology
          </ToolBtn>
        )}
        <IconToolBtn
          label="Print"
          href={mailPath(
            scope.workspaceSlug,
            scope.mailboxSlug,
            "print",
            `?${new URLSearchParams({
              id: selectedEmail.id,
              tz: viewerTimeZone(),
              ...(images !== "block" && { images: "shown" }),
              ...(!privacy.cleanLinks && { links: "keep" }),
            })}`,
          )}
        >
          <Printer className="size-3.5" strokeWidth={2} />
        </IconToolBtn>
        <ToolBtn
          href={mailPath(
            scope.workspaceSlug,
            scope.mailboxSlug,
            "original",
            `?${new URLSearchParams({ id: selectedEmail.id })}`,
          )}
        >
          <FileCode className="size-3.25" strokeWidth={2} />
          View original
        </ToolBtn>
      </div>

      {selectedEmail.folder === "trash" && (
        <div
          className="shrink-0 border-b px-4 py-2 text-[11px] md:px-6 border-border-soft text-faint"
          style={{
            background: "rgba(192,57,43,0.06)",
          }}
        >
          {selectedEmail.provider === "google"
            ? "Messages in Trash are permanently deleted after 30 days (Gmail policy)."
            : selectedEmail.provider === "microsoft"
              ? "Messages in Trash are permanently deleted after 30 days (Outlook policy)."
              : selectedEmail.provider === "zoho"
                ? "Messages in Trash are permanently deleted after 30 days (Zoho Mail policy)."
                : "Your mail server decides when messages in Trash are permanently deleted."}{" "}
          Click <span className="text-muted-foreground">Restore</span> to move this email back to
          Inbox.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div ref={scrollContentRef} className="px-6 py-6 md:px-10 md:py-8">
            <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 flex items-start justify-between gap-3 bg-background/95 px-6 pt-6 pb-3 backdrop-blur-sm md:-mx-10 md:-mt-8 md:px-10 md:pt-8">
              <h2 className="min-w-0 wrap-break-word text-[26px] font-medium leading-tight tracking-[-0.3px] md:text-[30px] text-foreground">
                {selectedEmail.subject}
              </h2>
              {phishingDetectionEnabled && (
                <PhishingIndicator
                  loading={analysisLoading}
                  error={analysisError}
                  result={analysis}
                />
              )}
            </div>

            <div className="mb-8 flex items-start gap-3.5 border-b pb-6 border-border-soft">
              <PersonMenu
                email={fromEmail}
                name={selectedEmail.fromName}
                match={senderMatch}
                onSave={saveContact.save}
                decorative
                className="relative shrink-0 rounded-full hover:no-underline"
              >
                <PersonAvatar name={fromName} email={fromEmail} className="size-11 text-[15px]" />
                {senderMatch && <SavedBadge />}
              </PersonMenu>
              <div className="min-w-0 flex-1">
                <PersonMenu
                  email={fromEmail}
                  name={selectedEmail.fromName}
                  match={senderMatch}
                  onSave={saveContact.save}
                  className="block max-w-full"
                >
                  <span className="block text-[14px] font-medium text-foreground">{fromName}</span>
                  <span className="block text-[12px] font-mono text-faint">{fromEmail}</span>
                </PersonMenu>
                {(toRecipients.length > 0 || ccRecipients.length > 0) && (
                  <div className="mt-0.5 text-[12px] text-faint">
                    <button
                      type="button"
                      onClick={() => setRecipientsExpanded((s) => !s)}
                      aria-expanded={recipientsExpanded}
                      className="flex max-w-full items-center gap-1 text-left transition-colors hover:text-muted-foreground"
                    >
                      <span className="min-w-0 truncate">
                        To:{" "}
                        {toRecipients
                          .slice(0, 2)
                          .map((r) => r.name || r.email)
                          .join(", ")}
                        {toRecipients.length > 2 ? ` +${toRecipients.length - 2}` : ""}
                        {ccRecipients.length > 0 ? ` · Cc: ${ccRecipients.length}` : ""}
                      </span>
                      {recipientsExpanded ? (
                        <ChevronUp className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                    </button>
                    {recipientsExpanded && (
                      <div className="mt-1.5 space-y-1.5 rounded-md border border-border-soft bg-surface px-2.5 py-2">
                        <RecipientLine
                          label="To"
                          recipients={toRecipients}
                          matches={contactMatches}
                          onSave={saveContact.save}
                        />
                        {ccRecipients.length > 0 && (
                          <RecipientLine
                            label="Cc"
                            recipients={ccRecipients}
                            matches={contactMatches}
                            onSave={saveContact.save}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="whitespace-nowrap text-[12px] text-faint">
                  {formatRelativeDate(selectedEmail.date)}
                </div>
                <div className="flex items-center gap-1.5">
                  {blockedImages > 0 && (
                    <RemoteImagesChip
                      count={blockedImages}
                      sender={selectedEmail.from}
                      messageId={selectedEmail.id}
                      proxied={privacy.proxyEndpoint !== null}
                    />
                  )}
                  <TrackerBadge hits={rendered?.trackers ?? []} />
                </div>
              </div>
            </div>

            <ThreadSummaryCard
              loading={summaryLoading}
              error={summaryError}
              result={summary}
              cleanUrl={cleanSummaryUrl}
              actions={{
                snooze: handleSnooze,
                showEmail: hasBody ? handleShowEmail : null,
                unsubscribe: {
                  available: unsubMethods.length > 0,
                  status: unsubStatus,
                  busy: unsubBusy,
                  run: handleUnsubscribe,
                },
              }}
            />

            {threadMessages.length > 1 && (
              <div className="mb-6 space-y-2">
                {threadMessages
                  .filter((m) => m.id !== selectedEmail.id)
                  .map((m) => (
                    <ThreadMessageCard
                      key={m.id}
                      message={m}
                      expanded={expandedThread.has(m.id)}
                      thread={threadBodies[m.id]}
                      privacy={privacy}
                      onToggle={() =>
                        setExpandedThread((s) => {
                          const next = new Set(s);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      renderAttachments={(thread) => (
                        <AttachmentList
                          messageId={m.id}
                          attachments={thread.attachments}
                          savingKey={savingAttachment}
                          downloadingKey={downloadingAttachment}
                          onDownload={handleDownloadAttachment}
                          onSave={(messageId, att) => setSaveTarget({ messageId, att })}
                          className="mt-4 border-t pt-3 border-border-soft"
                        />
                      )}
                    />
                  ))}
              </div>
            )}

            <div>
              {isFetchingBody ? (
                <div className="space-y-3">
                  {SKELETON_WIDTHS.map((width) => (
                    <div
                      key={width}
                      className="h-4 animate-pulse rounded bg-hover"
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </div>
              ) : hasBody ? (
                <div className="relative">
                  <div className={cn(bodyCapped && "max-h-140 overflow-hidden")}>
                    <div ref={bodyRef}>
                      <MessageContent
                        body={body}
                        rendered={rendered}
                        images={images}
                        proxyEndpoint={privacy.proxyEndpoint}
                        messageId={selectedEmail.id}
                        title={`Email: ${selectedEmail.subject || "(no subject)"}`}
                        textClassName="max-w-170 text-[15px] leading-[1.8]"
                        onBlockedImages={setBlockedImages}
                      />
                    </div>
                  </div>
                  {bodyOverflows &&
                    (bodyCapped ? (
                      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-background pt-12 pb-2">
                        <Button size="sm" variant="outline" onClick={() => setBodyCapped(false)}>
                          Show full message
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3 flex justify-center">
                        <Button size="sm" variant="outline" onClick={() => setBodyCapped(true)}>
                          Show less
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <MessageContent
                  body={body ?? { kind: "empty" }}
                  rendered={null}
                  images="block"
                  proxyEndpoint={null}
                  messageId={selectedEmail.id}
                />
              )}

              <AttachmentList
                messageId={selectedEmail.id}
                attachments={attachments}
                savingKey={savingAttachment}
                downloadingKey={downloadingAttachment}
                onDownload={handleDownloadAttachment}
                onSave={(messageId, att) => setSaveTarget({ messageId, att })}
                className="mt-8 border-t pt-6 border-border-soft"
              />

              {aiEnabled && selectedEmail.folder !== "drafts" && (
                <section aria-label="Quick replies" className="mt-6 flex flex-col gap-2.5">
                  {(smartRepliesLoading || smartReplies.length > 0) && (
                    <div
                      role="group"
                      aria-label="Smart replies"
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      {smartRepliesLoading && (
                        <Loader2 className="size-3 animate-spin text-faint" />
                      )}
                      {smartReplies.map((r) => (
                        <Button
                          key={r.label}
                          variant="outline"
                          size="xs"
                          onClick={() => reply(`<p>${r.body.replace(/\n/g, "</p><p>")}</p>`)}
                          title={r.body}
                          className="rounded-full bg-surface text-[11px] text-primary hover:bg-brand-soft hover:border-primary/40"
                        >
                          {r.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div
                    role="group"
                    aria-label="Reply with stance"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {REPLY_STANCES.map((st) => (
                      <Button
                        key={st.key}
                        variant="outline"
                        size="xs"
                        onClick={() => handleDraftStance(st.key)}
                        disabled={stanceLoading !== null}
                        title={`Draft a reply: ${st.label}`}
                        className={cn(
                          "rounded-full bg-surface text-[11px] text-muted-foreground",
                          stanceLoading === st.key
                            ? "opacity-70"
                            : "hover:bg-brand-soft hover:border-primary/40 hover:text-primary",
                        )}
                      >
                        {stanceLoading === st.key ? (
                          <Loader2 className="size-2.75 animate-spin" />
                        ) : (
                          <MessageCircleQuestion className="size-2.75" />
                        )}
                        {st.label}
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {snoozePickerOpen && (
        <PickTimeDialog
          title="Snooze until"
          label="When it comes back"
          preview="Comes back"
          confirmLabel="Confirm snooze"
          onClose={() => setSnoozePickerOpen(false)}
          onConfirm={(date) => {
            setSnoozePickerOpen(false);
            void handleSnooze(date);
          }}
        />
      )}

      <AlertDialog open={apologyOpen} onOpenChange={setApologyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-primary" />
              Draft an apology
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tell me what you're apologizing for. I'll write a reply in the tone you pick.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="apology-situation"
                className="text-[11px] uppercase tracking-[1.5px] text-faint"
              >
                What are you apologizing for?
              </label>
              <textarea
                id="apology-situation"
                value={apologySituation}
                onChange={(e) => setApologySituation(e.target.value)}
                maxLength={500}
                placeholder="e.g. missed our 3pm call yesterday"
                className="min-h-20 w-full resize-none rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-[rgba(200,146,42,0.4)]"
                disabled={apologyLoading}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[1.5px] text-faint">Tone</div>
              <div className="flex gap-2">
                {(["brief", "warm", "formal"] as const).map((t) => (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    onClick={() => setApologyTone(t)}
                    disabled={apologyLoading}
                    className={cn(
                      "flex-1 capitalize",
                      apologyTone === t
                        ? "border-primary bg-brand-soft text-primary"
                        : "bg-transparent text-muted-foreground dark:bg-transparent",
                    )}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            {apologyError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-text">
                {apologyError}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apologyLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDraftApology();
              }}
              disabled={!apologySituation.trim() || apologyLoading}
            >
              {apologyLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Drafting…
                </>
              ) : (
                "Draft reply"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {saveContact.dialog}
      <DrivePickerDialog
        open={saveTarget !== null}
        onOpenChange={(next) => !next && setSaveTarget(null)}
        title="Save to Drive"
        description={`Choose the folder to save ${saveTarget?.att.filename ?? "this attachment"} into.`}
        confirmLabel="Save here"
        mode="folder"
        onPick={handleSaveToDrive}
      />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the message to Trash. You can restore it later from the Trash folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconToolBtn({
  label,
  children,
  onClick,
  href,
  danger,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: Route;
  danger?: boolean;
  disabled?: boolean;
}) {
  const className = cn(
    "bg-transparent text-muted-foreground dark:bg-transparent",
    danger &&
      "hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive-text dark:hover:bg-destructive/10",
  );
  if (href) {
    return (
      <IconButton
        label={label}
        variant="outline"
        size="icon-sm"
        nativeButton={false}
        render={<Link href={href} prefetch={false} target="_blank" rel="noopener" />}
        className={className}
      >
        {children}
      </IconButton>
    );
  }
  return (
    <IconButton
      label={label}
      variant="outline"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </IconButton>
  );
}

function ToolBtn({
  children,
  onClick,
  href,
  danger,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: Route;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const className = cn(
    "bg-transparent text-muted-foreground dark:bg-transparent",
    danger &&
      "hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive-text dark:hover:bg-destructive/10",
  );
  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        target="_blank"
        rel="noopener"
        title={title}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
      >
        {children}
      </Link>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
    >
      {children}
    </Button>
  );
}

function ThreadMessageCard({
  message,
  expanded,
  thread,
  privacy,
  onToggle,
  renderAttachments,
}: {
  message: ThreadMessage;
  expanded: boolean;
  thread: ThreadBody | undefined;
  privacy: MailPrivacy;
  onToggle: () => void;
  renderAttachments: (thread: ThreadBody) => React.ReactNode;
}) {
  const body: MessageBody | null = thread?.body ?? null;
  const images = privacy.imagesFor(message.from, message.id);
  const rendered = useRenderedEmail(
    privacy,
    expanded && body?.kind === "html" ? body.html : null,
    images,
  );
  const [blockedImages, setBlockedImages] = useState(0);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 pr-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2 text-left transition-colors"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-active text-[11px] font-medium text-muted-foreground">
            {(message.fromName || message.from || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12px] font-medium text-foreground">
                {message.fromName || message.from}
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-faint">
                {formatRelativeDate(message.date)}
              </span>
            </div>
            {!expanded && (
              <div className="mt-0.5 truncate text-[11px] text-faint">{message.snippet}</div>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-faint" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
          )}
        </button>
        {expanded && blockedImages > 0 && (
          <RemoteImagesChip
            count={blockedImages}
            sender={message.from}
            messageId={message.id}
            proxied={privacy.proxyEndpoint !== null}
          />
        )}
        {expanded && <TrackerBadge hits={rendered?.trackers ?? []} />}
      </div>
      {expanded && (
        <div className="border-t border-border-soft px-3.5 py-3">
          {thread?.loading || !thread ? (
            <div className="flex items-center gap-2 text-[12px] text-faint">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading message…
            </div>
          ) : (
            <>
              <MessageContent
                body={body}
                rendered={rendered}
                images={images}
                proxyEndpoint={privacy.proxyEndpoint}
                messageId={message.id}
                textClassName="max-w-170 text-[13px] leading-[1.7]"
                onBlockedImages={setBlockedImages}
              />
              {renderAttachments(thread)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function attachmentKey(messageId: string, att: Attachment): string {
  return `${messageId}\u0000${att.id}`;
}

function AttachmentList({
  messageId,
  attachments,
  savingKey,
  downloadingKey,
  onDownload,
  onSave,
  className,
}: {
  messageId: string;
  attachments: Attachment[];
  savingKey: string | null;
  downloadingKey: string | null;
  onDownload: (messageId: string, att: Attachment) => void;
  onSave: (messageId: string, att: Attachment) => void;
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={className}>
      <div className="mb-3 text-[11px] uppercase tracking-[1.5px] text-faint">
        {attachments.length} attachment
        {attachments.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {attachments.map((att) => {
          const key = attachmentKey(messageId, att);
          const saving = savingKey === key;
          const downloading = downloadingKey === key;
          return (
            <div
              key={att.id}
              className="flex items-center overflow-hidden rounded-[10px] border border-border bg-surface"
            >
              <div className="flex min-w-0 items-center gap-2.5 px-3.5 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
                  <Paperclip className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-foreground">
                    {att.filename}
                  </div>
                  <div className="text-[11px] text-faint">{formatBytes(att.size)}</div>
                </div>
              </div>
              <div className="mr-1.5 flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${att.filename}`}
                  title="Download"
                  disabled={downloading}
                  onClick={() => onDownload(messageId, att)}
                  className="h-8 w-8 rounded-lg"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Save ${att.filename} to a drive`}
                  title="Save to Drive"
                  disabled={saving}
                  onClick={() => onSave(messageId, att)}
                  className="h-8 w-8 rounded-lg"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HardDriveDownload className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThreadSummaryCard({
  loading,
  error,
  result,
  actions,
  cleanUrl,
}: {
  loading: boolean;
  error: string | null;
  result: ThreadSummaryOutput | null;
  cleanUrl?: (url: string) => string;
  actions: SummaryActions;
}) {
  if (loading) {
    return (
      <div className="my-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] bg-surface border-border text-faint">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Summarizing…
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-muted">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive-text" />
        <div className="min-w-0">
          <div>Couldn't summarize this thread.</div>
          <div className="mt-0.5 wrap-break-word text-[11px]">{error}</div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (!result.spec) {
    return (
      <div className="my-4 rounded-lg border px-3 py-2 text-[12px] bg-surface border-border text-faint">
        No summary for this email
      </div>
    );
  }

  return <ThreadSummaryCards spec={result.spec} actions={actions} cleanUrl={cleanUrl} />;
}

type PhishingVerdict = "pending" | "error" | "safe" | "suspicious" | "phishing";

const phishingIndicatorVariants = cva("rounded-full border", {
  variants: {
    verdict: {
      pending: "border-border bg-surface",
      error: "border-border bg-surface",
      safe: "border-[rgba(39,174,96,0.25)] bg-[rgba(39,174,96,0.1)]",
      suspicious: "border-[rgba(200,146,42,0.3)] bg-[rgba(200,146,42,0.12)]",
      phishing: "border-[rgba(192,57,43,0.25)] bg-[rgba(192,57,43,0.12)]",
    },
  },
  defaultVariants: { verdict: "pending" },
});

const phishingColorVariants = cva("", {
  variants: {
    verdict: {
      pending: "text-faint",
      error: "text-faint",
      safe: "text-status-success",
      suspicious: "text-brand-text",
      phishing: "text-status-danger",
    },
  },
  defaultVariants: { verdict: "pending" },
});

const ACTION_ADVICE: Record<AnalysisResultOutput["action"], string> = {
  allow: "No action needed",
  warn: "Open links and attachments with caution",
  block: "Don't click links, reply, or share anything",
};

const PHISHING_VERDICT_META: Record<PhishingVerdict, { icon: typeof ShieldCheck; label: string }> =
  {
    pending: { icon: Loader2, label: "Analyzing for phishing…" },
    error: { icon: ShieldAlert, label: "Couldn't check this email" },
    safe: { icon: ShieldCheck, label: "Safe" },
    suspicious: { icon: ShieldAlert, label: "Suspicious" },
    phishing: { icon: ShieldX, label: "Phishing" },
  };

function PhishingIndicator({
  loading,
  error,
  result,
}: {
  loading: boolean;
  error: string | null;
  result: AnalysisResultOutput | null;
}) {
  if (!loading && !error && !result) return null;

  const verdict: PhishingVerdict = loading
    ? "pending"
    : error
      ? "error"
      : result?.classification === "Phishing"
        ? "phishing"
        : result?.classification === "Suspicious"
          ? "suspicious"
          : "safe";
  const { icon: Icon, label } = PHISHING_VERDICT_META[verdict];

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Button
            size="icon-lg"
            aria-label={`Phishing analysis: ${label}`}
            className={cn(
              phishingIndicatorVariants({ verdict }),
              phishingColorVariants({ verdict }),
            )}
          />
        }
      >
        <Icon className={cn("h-4 w-4", loading && "animate-spin")} />
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing for phishing…
          </div>
        ) : error ? (
          <div className="min-w-0 text-[12px]">
            <div className="text-muted-foreground">Couldn't check this email</div>
            <div className="mt-0.5 wrap-break-word text-[11px] text-faint">{error}</div>
          </div>
        ) : result ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4 shrink-0", phishingColorVariants({ verdict }))} />
              <span className={cn("text-[12px] font-medium", phishingColorVariants({ verdict }))}>
                {label}
              </span>
              <span className="text-[11px] text-faint">
                {ACTION_ADVICE[result.action]}
                {result.confidence < 0.8 && " — we're not certain"}
              </span>
            </div>
            {result.reasons.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {result.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-[12px] text-muted-foreground">
                    <span className={phishingColorVariants({ verdict })}>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
