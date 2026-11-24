"use client";

import { escapeText } from "entities";

import { renderEmailHtml } from "@/mail/render/pipeline";
import { type ComposeInitial, useComposeStore } from "@/store/compose-store";
import type { Email } from "@/types/mail";

import { bodyAsHtml, bodyFrom } from "./use-email-detail";
import { useMailPrivacy } from "./use-mail-privacy";
import { useMailboxEmails } from "./use-mailbox-emails";

function senderName(target: Email): string {
  return target.fromName || target.from;
}

function replyRecipients(target: Email, own: Set<string>): string[] {
  if (own.has(target.from.toLowerCase())) {
    const original = target.toRecipients?.map((r) => r.email) ?? target.to;
    if (original.length > 0) return original;
  }
  const replyTo = target.replyTo?.map((r) => r.email) ?? [];
  return replyTo.length > 0 ? replyTo : [target.from];
}

export function useReplyActions(email: Email | null) {
  const privacy = useMailPrivacy();
  const mailboxEmails = useMailboxEmails();
  const openCompose = useComposeStore((s) => s.open);

  function ownAddresses(target: Email): Set<string> {
    const own = new Set(Object.values(mailboxEmails).map((e) => e.toLowerCase()));
    if (target.mailboxEmail) own.add(target.mailboxEmail.toLowerCase());
    return own;
  }

  function quoteHtml(target: Email): string {
    const body = bodyFrom(target);
    if (body.kind !== "html") return bodyAsHtml(body);
    return (
      privacy.render(body.html, "quote")?.html ??
      renderEmailHtml(body.html, { purpose: "quote", trackers: null, links: null }).html
    );
  }

  function replyInitial(target: Email, replyHtml?: string): ComposeInitial {
    const name = senderName(target);
    const who = name !== target.from ? `${name} <${target.from}>` : target.from;
    const when = new Date(target.date).toLocaleString();
    const quotedHtml = `<p>On ${escapeText(when)}, ${escapeText(who)} wrote:</p><blockquote style="border-left:2px solid #cccccc;margin:0;padding-left:1ex">${quoteHtml(target)}</blockquote>`;
    const references = [target.references, target.messageIdHeader].filter(Boolean).join(" ");
    return {
      from: target.mailboxSlug,
      replyMailbox: target.mailboxSlug,
      to: replyRecipients(target, ownAddresses(target)).join(", "),
      subject: target.subject.startsWith("Re:") ? target.subject : `Re: ${target.subject}`,
      bodyHtml: replyHtml,
      quotedHtml,
      quoteImages: privacy.imagesFor(target.from, target.id),
      inReplyTo: target.messageIdHeader,
      references: references || undefined,
      replyToMessageId: target.id,
    };
  }

  function reply(replyHtml?: string) {
    if (!email) return;
    openCompose("reply", replyInitial(email, replyHtml), senderName(email));
  }

  function replyAll() {
    if (!email) return;
    const init = replyInitial(email);
    const own = ownAddresses(email);
    const toList = [
      ...replyRecipients(email, own),
      ...(email.toRecipients?.map((r) => r.email) ?? email.to),
    ].filter((e, i, arr) => e && !own.has(e.toLowerCase()) && arr.indexOf(e) === i);
    const ccList = (email.ccRecipients?.map((r) => r.email) ?? email.cc ?? []).filter(
      (e, i, arr) => e && !own.has(e.toLowerCase()) && !toList.includes(e) && arr.indexOf(e) === i,
    );
    openCompose(
      "reply",
      { ...init, to: toList.join(", ") || init.to, cc: ccList.join(", ") || undefined },
      senderName(email),
    );
  }

  function forward() {
    if (!email) return;
    const lines = [
      "---------- Forwarded message ----------",
      `From: ${senderName(email)} <${email.from}>`,
      `Date: ${new Date(email.date).toLocaleString()}`,
      `Subject: ${email.subject}`,
      `To: ${email.to.join(", ")}`,
    ];
    const quotedHtml = `<p>${lines.map((l) => escapeText(l)).join("<br>")}</p>${quoteHtml(email)}`;
    openCompose("forward", {
      from: email.mailboxSlug,
      subject: email.subject.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject}`,
      quotedHtml,
      quoteImages: privacy.imagesFor(email.from, email.id),
    });
  }

  return { reply, replyAll, forward };
}
