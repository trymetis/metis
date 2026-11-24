import type { ModelMessage } from "ai";

import { keysOf } from "@/lib/guards";
import { truncate } from "@/lib/utils";

import type { SummaryCardType } from "./summary-catalog";
import type { Conversation, ConvMsg } from "./summary-conversation";

const STRUCTURED_DATA_CHARS = 6000;
const ATTACHMENT_CHARS = 6000;
const MAX_ANCHORS = 30;
const ANCHOR_CHARS = 4000;

function renderHeaders(m: ConvMsg): string | null {
  const entries = Object.entries(m.headers);
  if (entries.length === 0) return null;
  return entries.map(([name, value]) => `${name}: ${value}`).join("\n");
}

function renderMessage(m: ConvMsg, index: number): string {
  const head = [
    `--- Message ${index + 1}`,
    m.from ? `From: ${m.from}` : null,
    m.date ? `Date: ${m.date}` : null,
    m.subject ? `Subject: ${m.subject}` : null,
    m.label ? `Label: ${m.label}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const parts = [`${head}\n---`, m.text];
  const headers = renderHeaders(m);
  if (headers) parts.push(`Mailing headers:\n${headers}`);
  if (m.structuredData.length > 0) {
    parts.push(
      `Structured data (schema.org, embedded by the sender):\n${truncate(
        JSON.stringify(m.structuredData),
        STRUCTURED_DATA_CHARS,
      )}`,
    );
  }
  if (m.anchors.length > 0) {
    parts.push(
      `Links:\n${truncate(
        m.anchors
          .slice(0, MAX_ANCHORS)
          .map((a) => `- ${a.text}: ${a.href}`)
          .join("\n"),
        ANCHOR_CHARS,
      )}`,
    );
  }
  for (const att of m.attachments) {
    parts.push(
      `${att.label} (attachment ${att.filename}):\n${truncate(
        JSON.stringify(att.data),
        ATTACHMENT_CHARS,
      )}`,
    );
  }
  for (const image of m.images) {
    parts.push(`Image attachment ${image.filename} is included below.`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function buildPrompt(
  conversation: Conversation,
  messages: ConvMsg[],
  intro: string,
): ModelMessage[] {
  const owner = conversation.owner
    ? `This mailbox belongs to ${conversation.owner}. Refer to them as "you".\n\n`
    : "";
  const text = `${owner}${intro}\n\n${messages.map(renderMessage).join("\n\n")}`;
  return [
    {
      role: "user",
      content: [
        { type: "text", text },
        ...messages.flatMap((m) =>
          m.images.flatMap((image) => [
            {
              type: "text" as const,
              text: `Image attachment ${image.filename} (from ${m.from ?? "the sender"}):`,
            },
            {
              type: "image" as const,
              image: new Uint8Array(image.bytes),
              mediaType: image.mediaType,
            },
          ]),
        ),
      ],
    },
  ];
}

export type DetailCardType = Exclude<SummaryCardType, "Summary">;

export const CARD_DEFINITIONS: Record<DetailCardType, string> = {
  Otp: "a verification, sign-in, one-time or security code",
  ActionLink:
    "an email that exists to deliver one link — password reset, magic sign-in link, verify your email, accept an invitation, confirm a subscription",
  SecurityAlert:
    "a new sign-in, new device, password or 2FA change, or other account security notice",
  Meeting: "a meeting, call, interview or calendar invite",
  Order: "a purchase confirmation or receipt",
  Shipment: "a package shipping or delivery update",
  Transaction:
    "a bank, card, UPI or wallet alert about money moving — debit, credit, refund, a payment request or a failed payment",
  Bill: "a bill, invoice, statement, payment due or payment received",
  Subscription:
    "a subscription renewal, trial ending, price change, failed renewal payment or cancellation",
  Reservation: "a flight, hotel, train, bus, car rental, restaurant or event booking",
  SharedDocument:
    "a file or folder shared with you, a document to sign, a signed document, or a comment on a document",
  Offer: "a coupon, promo code or sale",
  Digest: "a newsletter or digest",
  DevNotification:
    "a pull request, merge request, issue, review request, CI run, release or ticket update from GitHub, GitLab, Bitbucket, Jira, Linear or similar",
  Contact:
    "a person or business shared as a contact card, or whose contact details the email hands over to be saved (an introduction, a new point of contact)",
};

const CARD_NOTES: Partial<Record<DetailCardType, string>> = {
  Otp: "Only the latest code per service.",
  ActionLink:
    "confirms names the thing the link confirms, verifies, resets or accepts; account is the account, username, address or workspace it applies to; ifIgnored is what the email says happens when the link is not used (the request is cancelled, the invitation lapses, the account stays unverified). Each is null when the email does not say it.",
  Meeting: "status is cancelled when it was cancelled, updated when rescheduled.",
  Shipment: "One card per package, at its latest state.",
  Transaction: "Not an order receipt (Order) or a bill (Bill).",
  Reservation:
    "Fill barcode from a ticketToken, reservedTicket or wallet pass barcode when present.",
  Digest: "Reduce it to its top stories.",
  Contact: "Not the sender's ordinary signature.",
};

function cardLine(type: DetailCardType): string {
  const note = CARD_NOTES[type];
  return `- ${type}: ${CARD_DEFINITIONS[type]}.${note ? ` ${note}` : ""}`;
}

const CARD_RULES = [
  "Each message comes with its headers, body text, its label, mailing headers for the latest message and, when present: schema.org structured data (JSON-LD or microdata) embedded by the sender, the email's links, and parsed attachments — calendar invites, contact cards, wallet passes, PDF text, forwarded emails — and images. Structured data and parsed attachments are authoritative for codes, numbers, IDs, amounts and dates; prefer them over the prose.",
  "Mailing headers such as auto-submitted, precedence: bulk, list-id or list-unsubscribe mean the email is automated.",
  "Card types:",
  ...keysOf(CARD_DEFINITIONS).map(cardLine),
  "- tldr: fill it only when the conversation has substance the cards do not capture — discussion, decisions, questions, requests, anything that needs a reply. An automated notification gets null. When no card applies, fill it. It is the conversation's only TL;DR; never put a Summary in cards.",
  "Never invent values: use null when the email does not say. Copy URLs verbatim from the email's links. Write dates as ISO 8601 and resolve relative dates against the date of the message that mentions them.",
  "The tldr is concrete and factual with no greetings or filler; keyPoints are most important first; actionItems list only outstanding tasks and who owns each.",
  "Reply only with json matching the requested schema.",
].join("\n");

export const SYSTEM_FULL = `You turn an email conversation into TL;DR cards shown above the email.\n\n${CARD_RULES}`;

export const SYSTEM_REFINE = `You maintain the TL;DR cards shown above an email conversation. Given the current cards and the new message(s), return the full UPDATED set of cards. Update a card in place when a new message is about the same thing (same order number, tracking number, invite UID, confirmation code, bill reference, transaction reference, subscription, pull request or issue number, document, the same person's contact, or a newer code or link from the same service), add cards for new things, drop cards the new messages make obsolete, and rewrite the tldr to reflect the latest state. Do not merely append.\n\n${CARD_RULES}`;
