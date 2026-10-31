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
import { Button } from "@metis/ui/components/button";
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
import { cva } from "class-variance-authority";
import { escapeText } from "entities";
import {
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
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Star,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type DrivePick, DrivePickerDialog } from "@/components/drive-picker-dialog";
import { PickTimeDialog } from "@/components/pick-time-dialog";
import { useScopePolicy } from "@/components/scope-policy-context";
import { base64ToBlob, uploadToDrive } from "@/drive/upload-client";
import { useCurrentEmails } from "@/hooks/use-current-emails";
import { useCustomLabels } from "@/hooks/use-custom-labels";
import {
  bodyAsHtml,
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
import { useMailboxEmails } from "@/hooks/use-mailbox-emails";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { inOrder } from "@/lib/in-order";
import { orpc } from "@/lib/orpc";
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
import { printEmail, viewOriginalEmail } from "@/mail/popup";
import { cleanUrl as cleanTrackedUrl, renderEmailHtml } from "@/mail/render/pipeline";
import type { RemoteImages } from "@/mail/render/types";
import type { AnalysisResultOutput, ThreadSummaryOutput } from "@/server/schema";
import { type ComposeInitial, useMailStore } from "@/store/mail-store";
import type { Attachment } from "@/types/mail";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

import { MessageContent } from "./message-content";
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

function RecipientLine({
  label,
  recipients,
}: {
  label: string;
  recipients: { email: string; name?: string }[];
}) {
  return (
    <div className="flex gap-2">
      <span className="w-6 shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-faint">
        {label}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {recipients.map((r) => (
          <div key={`${r.email}-${r.name ?? ""}`} className="min-w-0">
            {r.name && <span className="text-[12px] text-muted-foreground">{r.name} </span>}
            <span className="break-all font-mono text-[11px] text-faint">{r.email}</span>
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
    setComposeOpen,
    visibleEmailIds,
  } = useMailStore();
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

  const phishingDetectionEnabled = useScopePolicy().phishingDetection;
  const { body, bodyHtml } = useEmailBody(selectedEmail);
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
  } = useThreadSummary(selectedEmail, true); // FIXME(ai): add support for thread summaries disabling
  const attachments = useAttachments(selectedEmail?.id);
  const {
    messages: threadMessages,
    expanded: expandedThread,
    setExpanded: setExpandedThread,
  } = useThread(selectedEmail?.id, selectedEmail?.threadId);
  const threadBodies = useThreadBodies(selectedEmail?.id, expandedThread);
  const { replies: smartReplies, loading: smartRepliesLoading } = useSmartReplies(selectedEmail);
  const {
    methods: unsubMethods,
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
  const [smartRepliesExpanded, setSmartRepliesExpanded] = useState(false);
  const [apologyOpen, setApologyOpen] = useState(false);
  const [snoozePickerOpen, setSnoozePickerOpen] = useState(false);
  const [apologySituation, setApologySituation] = useState("");
  const [apologyTone, setApologyTone] = useState<"brief" | "warm" | "formal">("warm");
  const [apologyLoading, setApologyLoading] = useState(false);
  const [apologyError, setApologyError] = useState<string | null>(null);
  const [stanceLoading, setStanceLoading] = useState<string | null>(null);
  const mailboxEmails = useMailboxEmails();
  const [quickReplyText, setQuickReplyText] = useState("");
  const [bodyCapped, setBodyCapped] = useState(false);
  const [bodyOverflows, setBodyOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);
  const [replyRailOpen, setReplyRailOpen] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const wasAtEndRef = useRef(false);
  const railDismissedRef = useRef(false);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const footerOverlayRef = useRef<HTMLDivElement | null>(null);
  const [footerOverlayHeight, setFooterOverlayHeight] = useState(0);
  const replyFooterExpanded = reachedEnd || replyRailOpen;
  const hasReplyFooter =
    !!selectedEmail &&
    (selectedEmail.folder !== "drafts" || smartRepliesLoading || smartReplies.length > 0);

  const [shownEmailId, setShownEmailId] = useState(selectedEmail?.id);
  if (selectedEmail?.id !== shownEmailId) {
    setShownEmailId(selectedEmail?.id);
    setSmartRepliesExpanded(false);
    setApologyOpen(false);
    setApologySituation("");
    setApologyTone("warm");
    setApologyError(null);
    setStanceLoading(null);
    setUnsubBusy(false);
    setQuickReplyText("");
    setRecipientsExpanded(false);
    setReplyRailOpen(false);
    setReachedEnd(false);
  }

  useEffect(() => {
    wasAtEndRef.current = false;
    railDismissedRef.current = false;
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

  useEffect(() => {
    if (isFetchingBody) return;
    const content = scrollContentRef.current;
    const viewport = content?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!content || !viewport) return;
    const distanceFromEnd = () =>
      content.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom;
    const measure = () => {
      const dist = distanceFromEnd();
      const atEnd = dist <= 16;
      if (dist >= 120) {
        railDismissedRef.current = false;
        setReachedEnd(false);
      } else if (atEnd && !wasAtEndRef.current && !railDismissedRef.current) {
        setReachedEnd(true);
      }
      wasAtEndRef.current = atEnd;
    };
    wasAtEndRef.current = distanceFromEnd() <= 16;
    viewport.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      viewport.removeEventListener("scroll", measure);
      observer.disconnect();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- re-measure when the open email changes, not only when the body finishes loading.
  }, [isFetchingBody, selectedEmail?.id]);

  useEffect(() => {
    const overlay = footerOverlayRef.current;
    if (!overlay) {
      setFooterOverlayHeight(0);
      return;
    }
    const sync = () => setFooterOverlayHeight(overlay.offsetHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(overlay);
    return () => observer.disconnect();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the overlay node mounts/unmounts with hasReplyFooter — the observer must re-attach when it appears.
  }, [hasReplyFooter]);

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

    useMailStore.getState().setComposeInitial({
      to: selectedEmail.to.join(", "),
      cc: selectedEmail.cc?.join(", ") || "",
      bcc: "",
      subject: selectedEmail.subject ?? "",
      bodyHtml: bodyHtml ?? "",
      draftId: selectedEmail.id,
    });
    setComposeOpen(true);
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
      const init = replyComposeInitial(res.bodyHtml);
      if (init) {
        useMailStore.getState().setComposeInitial(init);
        setComposeOpen(true);
      }
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
      const init = replyComposeInitial(res.bodyHtml);
      if (init) {
        useMailStore.getState().setComposeInitial(init);
        setComposeOpen(true);
      }
    } catch {
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

  function ownAddresses(): Set<string> {
    const own = new Set(Object.values(mailboxEmails).map((e) => e.toLowerCase()));
    if (selectedEmail?.mailboxEmail) {
      own.add(selectedEmail.mailboxEmail.toLowerCase());
    }
    return own;
  }

  function replyRecipients(own: Set<string>): string[] {
    if (!selectedEmail) return [];
    if (own.has(selectedEmail.from.toLowerCase())) {
      const original = selectedEmail.toRecipients?.map((r) => r.email) ?? selectedEmail.to;
      if (original.length > 0) return original;
    }
    const replyTo = selectedEmail.replyTo?.map((r) => r.email) ?? [];
    return replyTo.length > 0 ? replyTo : [selectedEmail.from];
  }

  function quoteHtml(): string {
    if (body?.kind !== "html") return bodyAsHtml(body);
    return (
      privacy.render(body.html, "quote")?.html ??
      renderEmailHtml(body.html, {
        purpose: "quote",
        trackers: null,
        links: null,
      }).html
    );
  }

  function replyComposeInitial(replyHtml?: string): ComposeInitial | null {
    if (!selectedEmail) return null;
    const senderName = selectedEmail.fromName || selectedEmail.from;
    const who =
      senderName && senderName !== selectedEmail.from
        ? `${senderName} <${selectedEmail.from}>`
        : selectedEmail.from;
    const when = new Date(selectedEmail.date).toLocaleString();
    const quotedHtml = `<p>On ${escapeText(when)}, ${escapeText(who)} wrote:</p><blockquote style="border-left:2px solid #cccccc;margin:0;padding-left:1ex">${quoteHtml()}</blockquote>`;
    const references = [selectedEmail.references, selectedEmail.messageIdHeader]
      .filter(Boolean)
      .join(" ");
    return {
      to: replyRecipients(ownAddresses()).join(", "),
      subject: selectedEmail.subject.startsWith("Re:")
        ? selectedEmail.subject
        : `Re: ${selectedEmail.subject}`,
      bodyHtml: replyHtml,
      quotedHtml,
      quoteImages: images,
      inReplyTo: selectedEmail.messageIdHeader,
      references: references || undefined,
      replyToMessageId: selectedEmail.id,
    };
  }

  function handleReply(replyHtml?: string) {
    const init = replyComposeInitial(replyHtml);
    if (!init) return;
    setComposeOpen(true);
    useMailStore.getState().setComposeInitial(init);
  }

  function handleReplyAll() {
    if (!selectedEmail) return;
    const init = replyComposeInitial();
    if (!init) return;
    const own = ownAddresses();
    const toList = [
      ...replyRecipients(own),
      ...(selectedEmail.toRecipients?.map((r) => r.email) ?? selectedEmail.to),
    ].filter((e, i, arr) => e && !own.has(e.toLowerCase()) && arr.indexOf(e) === i);
    const ccList = (
      selectedEmail.ccRecipients?.map((r) => r.email) ??
      selectedEmail.cc ??
      []
    ).filter(
      (e, i, arr) => e && !own.has(e.toLowerCase()) && !toList.includes(e) && arr.indexOf(e) === i,
    );
    setComposeOpen(true);
    useMailStore.getState().setComposeInitial({
      ...init,
      to: toList.join(", ") || init.to,
      cc: ccList.join(", ") || undefined,
    });
  }

  function handleForward() {
    if (!selectedEmail) return;
    const senderName = selectedEmail.fromName || selectedEmail.from;
    const lines = [
      "---------- Forwarded message ----------",
      `From: ${senderName} <${selectedEmail.from}>`,
      `Date: ${new Date(selectedEmail.date).toLocaleString()}`,
      `Subject: ${selectedEmail.subject}`,
      `To: ${selectedEmail.to.join(", ")}`,
    ];
    const quotedHtml = `<p>${lines.map((l) => escapeText(l)).join("<br>")}</p>${quoteHtml()}`;
    setComposeOpen(true);
    useMailStore.getState().setComposeInitial({
      subject: selectedEmail.subject.startsWith("Fwd:")
        ? selectedEmail.subject
        : `Fwd: ${selectedEmail.subject}`,
      quotedHtml,
      quoteImages: images,
    });
  }

  function handleQuickReplySend() {
    const text = quickReplyText.trim();
    handleReply(text ? `<p>${escapeText(text).replace(/\n/g, "</p><p>")}</p>` : undefined);
    setQuickReplyText("");
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
    } catch {
      setUnsubStatus("failed");
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
        <p className="text-lg tracking-tight font-serif">Select a message to read</p>
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
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-4 py-3 scrollbar-none md:flex-wrap md:gap-2 md:overflow-x-visible md:px-6 border-border-soft [&::-webkit-scrollbar]:hidden">
        <ToolBtn onClick={() => setSelectedEmail(null)}>
          <ChevronLeft className="size-3.25" strokeWidth={2} />
          Back
        </ToolBtn>
        <ToolBtn onClick={() => navigateTo(prevId)} disabled={!prevId} title="Previous message">
          <ChevronUp className="size-3.25" strokeWidth={2} />
          Prev
        </ToolBtn>
        <ToolBtn onClick={() => navigateTo(nextId)} disabled={!nextId} title="Next message">
          <ChevronDown className="size-3.25" strokeWidth={2} />
          Next
        </ToolBtn>
        {selectedEmail.folder === "drafts" ? (
          <ToolBtn onClick={handleEditDraft}>
            <Pencil className="size-3.25" strokeWidth={2} />
            Edit draft
          </ToolBtn>
        ) : (
          <>
            {selectedEmail.to.length + (selectedEmail.cc?.length ?? 0) > 1 && (
              <ToolBtn onClick={handleReplyAll}>
                <ReplyAll className="size-3.25" strokeWidth={2} />
                Reply all
              </ToolBtn>
            )}
            <ToolBtn onClick={handleForward}>
              <Forward className="size-3.25" strokeWidth={2} />
              Forward
            </ToolBtn>
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

        <ToolBtn onClick={handleStar}>
          <Star
            className="size-3.25"
            strokeWidth={2}
            fill={selectedEmail.isStarred ? "var(--brand)" : "none"}
            color={selectedEmail.isStarred ? "var(--brand)" : "currentColor"}
          />
          {selectedEmail.isStarred ? "Starred" : "Star"}
        </ToolBtn>
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
        {unsubMethods.length > 0 && (
          <ToolBtn
            onClick={handleUnsubscribe}
            disabled={unsubBusy || unsubStatus === "done" || unsubStatus === "manual"}
            title={
              unsubStatus === "done"
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
          <ToolBtn onClick={handleArchive}>
            <Archive className="size-3.25" strokeWidth={2} />
            Archive
          </ToolBtn>
        )}
        <ToolBtn danger onClick={() => setConfirmDeleteOpen(true)}>
          <Trash2 className="size-3.25" strokeWidth={2} />
          Delete
        </ToolBtn>

        {selectedEmail.folder !== "drafts" && (
          <ToolBtn onClick={() => setApologyOpen(true)}>
            <HeartHandshake className="size-3.25" strokeWidth={2} />
            Draft apology
          </ToolBtn>
        )}
        <ToolBtn
          onClick={() =>
            printEmail(
              selectedEmail,
              (body?.kind === "html"
                ? privacy.render(body.html, "view", images, "light")?.html
                : null) ?? bodyAsHtml(body),
              { images, proxyEndpoint: privacy.proxyEndpoint },
            )
          }
        >
          <Printer className="size-3.25" strokeWidth={2} />
          Print
        </ToolBtn>
        <ToolBtn onClick={() => viewOriginalEmail(selectedEmail, scope)}>
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
              <h2 className="min-w-0 wrap-break-word text-[26px] font-medium leading-tight tracking-[-0.3px] md:text-[30px] font-serif text-foreground">
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[15px] bg-surface border-border font-serif text-brand-text">
                {fromName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-foreground">{fromName}</div>
                <div className="text-[12px] font-mono text-faint">{fromEmail}</div>
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
                        <RecipientLine label="To" recipients={toRecipients} />
                        {ccRecipients.length > 0 && (
                          <RecipientLine label="Cc" recipients={ccRecipients} />
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
                <TrackerBadge hits={rendered?.trackers ?? []} />
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
              <div className="mb-6 space-y-2 max-w-170">
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
                <div className="max-w-170 space-y-3">
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
                        sender={selectedEmail.from}
                        messageId={selectedEmail.id}
                        title={`Email: ${selectedEmail.subject || "(no subject)"}`}
                        frameClassName="max-w-170"
                        textClassName="max-w-170 text-[15px] leading-[1.8]"
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
                  sender={selectedEmail.from}
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
            </div>
          </div>
          <div aria-hidden style={{ height: footerOverlayHeight }} />
        </ScrollArea>

        {hasReplyFooter && (
          <div
            ref={footerOverlayRef}
            className="absolute inset-x-0 bottom-0 z-10 border-t bg-panel border-border-soft"
          >
            <button
              type="button"
              onClick={() => {
                if (replyFooterExpanded) {
                  railDismissedRef.current = true;
                  setReplyRailOpen(false);
                  setReachedEnd(false);
                } else {
                  railDismissedRef.current = false;
                  setReplyRailOpen(true);
                }
              }}
              aria-expanded={replyFooterExpanded}
              className="flex h-11 w-full items-center justify-between px-4 text-left transition-colors md:px-7 hover:bg-hover"
            >
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-[1.5px] text-faint">
                <Reply className="h-3.5 w-3.5 shrink-0" />
                Reply
                {!replyFooterExpanded && smartReplies.length > 0 && (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] normal-case tracking-normal border-border bg-surface text-primary">
                    {smartReplies.length} smart {smartReplies.length === 1 ? "reply" : "replies"}
                  </span>
                )}
                {!replyFooterExpanded && smartRepliesLoading && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </span>
              {replyFooterExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-faint" />
              )}
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                replyFooterExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div
                className={cn(
                  "min-h-0 overflow-hidden transition-opacity duration-200",
                  replyFooterExpanded ? "opacity-100" : "opacity-0",
                )}
              >
                {selectedEmail.folder !== "drafts" && (
                  <div className="border-t px-4 py-2 md:px-7 border-border-soft">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[1.5px] text-faint">
                        Reply with stance
                      </span>
                      {stanceLoading && <Loader2 className="h-3 w-3 animate-spin text-faint" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { key: "accept", label: "Accept" },
                          { key: "decline", label: "Polite decline" },
                          { key: "negotiate", label: "Negotiate" },
                          { key: "buy_time", label: "Buy time" },
                          { key: "clarify", label: "Clarify" },
                          { key: "defer", label: "Defer" },
                        ] as const
                      ).map((s) => (
                        <Button
                          key={s.key}
                          variant="outline"
                          size="xs"
                          onClick={() => handleDraftStance(s.key)}
                          disabled={stanceLoading !== null}
                          title={`Draft a ${s.label.toLowerCase()} reply`}
                          className={cn(
                            "rounded-full bg-surface text-[11px] text-muted-foreground",
                            stanceLoading === s.key
                              ? "opacity-70"
                              : "hover:bg-brand-soft hover:border-primary/40 hover:text-primary",
                          )}
                        >
                          {stanceLoading === s.key ? (
                            <Loader2 className="h-2.75 w-2.75 animate-spin" />
                          ) : (
                            <MessageCircleQuestion className="h-2.75 w-2.75" />
                          )}
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {(smartRepliesLoading || smartReplies.length > 0) && (
                  <div className="shrink-0 border-t px-4 py-2 md:px-7 border-border-soft">
                    <div className="mb-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSmartRepliesExpanded((s) => !s)}
                        className="flex items-center gap-1 text-[10px] uppercase tracking-[1.5px] text-faint hover:text-muted-foreground"
                        aria-expanded={smartRepliesExpanded}
                      >
                        Smart replies
                        {smartRepliesExpanded ? (
                          <ChevronDown className="h-2.75 w-2.75" />
                        ) : (
                          <ChevronUp className="h-2.75 w-2.75" />
                        )}
                      </button>
                      {smartRepliesLoading && (
                        <Loader2 className="h-3 w-3 animate-spin text-faint" />
                      )}
                    </div>
                    {smartRepliesExpanded ? (
                      <div className="flex flex-wrap gap-2">
                        {smartReplies.map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            onClick={() =>
                              handleReply(`<p>${r.body.replace(/\n/g, "</p><p>")}</p>`)
                            }
                            className="group flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-left transition-all bg-surface border-border hover:bg-brand-soft hover:border-primary/40"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                                {r.label}
                              </div>
                              <div className="line-clamp-2 text-[12px] text-muted-foreground">
                                {r.body}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {smartReplies.map((r) => (
                          <Button
                            key={r.label}
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              handleReply(`<p>${r.body.replace(/\n/g, "</p><p>")}</p>`)
                            }
                            title={r.body}
                            className="rounded-full bg-surface text-[11px] uppercase tracking-wide text-primary hover:bg-brand-soft hover:border-primary/40"
                          >
                            {r.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedEmail.folder !== "drafts" && (
                  <div className="border-t px-4 py-4 md:px-7 md:py-5 bg-panel border-border-soft">
                    <div className="overflow-hidden rounded-[10px] border transition-colors focus-within:border-[rgba(200,146,42,0.35)] bg-surface border-border">
                      <div className="border-b px-3.5 pb-2 pt-2.5 text-[12px] border-border-soft text-faint">
                        Reply to {fromName}
                      </div>
                      <textarea
                        placeholder="Write a reply…"
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                        className="min-h-18 w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed outline-none text-foreground"
                        aria-label="Reply text"
                      />
                      <div className="flex items-center justify-between border-t px-3 py-2 border-border-soft">
                        <span className="text-[11px] text-faint">
                          Continues in the composer with the original quoted
                        </span>
                        <Button size="sm" onClick={handleQuickReplySend}>
                          <Send className="size-3.25" />
                          Continue
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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

function ToolBtn({
  children,
  onClick,
  danger,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "bg-transparent text-muted-foreground dark:bg-transparent",
        danger &&
          "hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive-text dark:hover:bg-destructive/10",
      )}
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
                sender={message.from}
                messageId={message.id}
                textClassName="text-[13px] leading-[1.7]"
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
      <div className="my-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-muted">
        <AlertTriangle className="size-3.5 shrink-0 text-destructive-text" />
        Couldn't summarize this thread.
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
