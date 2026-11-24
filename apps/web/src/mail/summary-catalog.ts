import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { isNonEmpty } from "@/lib/guards";

const url = () => z.string().nullable().describe("A URL copied verbatim from the email, or null");

const moneySchema = z.object({
  amount: z.number(),
  currency: z.string().describe("ISO 4217 code, e.g. USD, EUR, INR"),
});

export const SHIPMENT_STATUSES = [
  "ordered",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delayed",
  "exception",
  "returned",
] as const;

export const BILL_STATUSES = ["due", "overdue", "paid", "autopay"] as const;

export const MEETING_STATUSES = ["scheduled", "updated", "cancelled"] as const;

export const RESERVATION_KINDS = [
  "flight",
  "hotel",
  "train",
  "bus",
  "car",
  "restaurant",
  "event",
  "other",
] as const;

export const TRANSACTION_DIRECTIONS = ["debit", "credit", "refund", "request", "failed"] as const;

export const SUBSCRIPTION_EVENTS = [
  "renewal_upcoming",
  "renewed",
  "trial_ending",
  "price_change",
  "payment_failed",
  "cancelled",
] as const;

export const ACTION_LINK_PURPOSES = [
  "password_reset",
  "sign_in",
  "verify_email",
  "invitation",
  "confirm",
  "other",
] as const;

export const SHARED_DOCUMENT_KINDS = [
  "share",
  "signature_request",
  "signed",
  "comment",
  "other",
] as const;

export const DEV_PLATFORMS = ["github", "gitlab", "bitbucket", "jira", "linear", "other"] as const;

export const DEV_KINDS = [
  "pull_request",
  "issue",
  "review_request",
  "ci",
  "release",
  "comment",
  "other",
] as const;

export const BARCODE_FORMATS = ["qr", "aztec", "pdf417", "code128", "other"] as const;

const barcodeSchema = z
  .object({
    format: z.enum(BARCODE_FORMATS),
    value: z.string().describe("The exact barcode payload"),
  })
  .nullable()
  .describe(
    "Ticket or boarding-pass barcode from structured data (ticketToken, reservedTicket) or a wallet pass",
  );

const expirySchema = {
  issuedAt: z
    .string()
    .nullable()
    .describe("ISO 8601 date of the message carrying it, copied from its header"),
  validForMinutes: z
    .number()
    .int()
    .nullable()
    .describe("How long the email says it stays valid, in minutes"),
};

export const summaryCardProps = {
  Tldr: z.object({
    text: z.string().describe("1-2 sentence plain-language summary of the conversation"),
    keyPoints: z.array(z.string()).describe("Key facts and decisions, most important first"),
    actionItems: z
      .array(z.string())
      .describe("Outstanding to-dos and who owns each. Empty array if none."),
  }),
  Otp: z.object({
    code: z
      .string()
      .describe("The verification / one-time / login code exactly as written, without spaces"),
    service: z.string().nullable().describe("Who the code is for, e.g. GitHub"),
    issuedAt: z
      .string()
      .nullable()
      .describe("ISO 8601 date of the message carrying the code, copied from its header"),
    validForMinutes: z
      .number()
      .int()
      .nullable()
      .describe("How long the email says the code is valid, in minutes"),
  }),
  Meeting: z.object({
    title: z.string(),
    start: z
      .string()
      .describe(
        "ISO 8601 with UTC offset, or YYYY-MM-DD when all-day. Resolve relative dates against the message date",
      ),
    end: z.string().nullable().describe("Same format as start"),
    allDay: z.boolean(),
    timeZone: z.string().nullable().describe("IANA zone of the event"),
    location: z.string().nullable(),
    meetingUrl: url(),
    organizer: z.string().nullable(),
    attendees: z.array(z.string()),
    status: z.enum(MEETING_STATUSES),
    uid: z.string().nullable().describe("Calendar UID from an invite, when present"),
  }),
  Order: z.object({
    merchant: z.string(),
    orderNumber: z.string().nullable(),
    status: z.string().nullable().describe("Short status, e.g. Confirmed, Refunded"),
    items: z.array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable(),
        price: moneySchema.nullable(),
      }),
    ),
    total: moneySchema.nullable(),
    orderUrl: url(),
  }),
  Shipment: z.object({
    merchant: z.string().nullable(),
    carrier: z.string().nullable(),
    trackingNumber: z.string().nullable(),
    orderNumber: z.string().nullable(),
    status: z.enum(SHIPMENT_STATUSES),
    expectedAt: z.string().nullable().describe("Expected delivery, ISO 8601 date or datetime"),
    deliveredAt: z.string().nullable().describe("ISO 8601, when delivered"),
    items: z.array(z.string()),
    trackingUrl: url(),
  }),
  Bill: z.object({
    payee: z.string(),
    amount: moneySchema.nullable(),
    dueDate: z.string().nullable().describe("ISO 8601 date"),
    status: z.enum(BILL_STATUSES),
    reference: z.string().nullable().describe("Invoice, statement or account number"),
    payUrl: url(),
  }),
  Reservation: z.object({
    kind: z.enum(RESERVATION_KINDS),
    title: z
      .string()
      .describe("Flight number and route, hotel or venue name — only what the email states"),
    provider: z.string().nullable(),
    confirmationCode: z.string().nullable(),
    start: z.string().describe("ISO 8601 with UTC offset"),
    end: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    location: z.string().nullable(),
    details: z.array(z.string()).describe("Seat, gate, room, guests, check-in time and similar"),
    manageUrl: url(),
    barcode: barcodeSchema,
  }),
  Transaction: z.object({
    direction: z.enum(TRANSACTION_DIRECTIONS),
    amount: moneySchema.nullable(),
    counterparty: z.string().nullable().describe("Merchant, payee or payer on the other side"),
    institution: z.string().nullable().describe("Bank, card issuer or wallet sending the alert"),
    account: z
      .string()
      .nullable()
      .describe("Masked account or card as the email shows it, as ••NNNN"),
    method: z.string().nullable().describe("Card, UPI, bank transfer, wallet, …"),
    balance: moneySchema.nullable().describe("Balance after, when stated"),
    reference: z.string().nullable(),
    occurredAt: z.string().nullable().describe("ISO 8601"),
    detailsUrl: url(),
  }),
  Subscription: z.object({
    service: z.string(),
    plan: z.string().nullable(),
    event: z.enum(SUBSCRIPTION_EVENTS),
    date: z.string().nullable().describe("Renewal, trial end or change date, ISO 8601"),
    amount: moneySchema.nullable(),
    previousAmount: moneySchema.nullable().describe("Old price on a change"),
    manageUrl: url(),
  }),
  ActionLink: z.object({
    purpose: z.enum(ACTION_LINK_PURPOSES),
    service: z.string().nullable(),
    label: z.string().describe("Short button text, e.g. Reset password, Accept invite"),
    confirms: z
      .string()
      .nullable()
      .describe(
        "What using the link confirms, verifies, resets or accepts, e.g. Your new email address, Joining the Acme workspace",
      ),
    account: z
      .string()
      .nullable()
      .describe("The account, username, email address or workspace the link applies to"),
    ifIgnored: z
      .string()
      .nullable()
      .describe(
        "What the email says happens if the link is not used, e.g. The change is cancelled",
      ),
    url: url(),
    ...expirySchema,
  }),
  SecurityAlert: z.object({
    service: z.string(),
    event: z.string().describe("What happened, e.g. New sign-in, Password changed"),
    device: z.string().nullable(),
    location: z.string().nullable(),
    ipAddress: z.string().nullable(),
    occurredAt: z.string().nullable().describe("ISO 8601"),
    reviewUrl: url().describe("The 'wasn't you' / review activity link, copied verbatim, or null"),
  }),
  SharedDocument: z.object({
    kind: z.enum(SHARED_DOCUMENT_KINDS),
    title: z.string(),
    sharedBy: z.string().nullable(),
    provider: z.string().nullable().describe("Google Drive, Dropbox, DocuSign, …"),
    message: z.string().nullable().describe("The sender's note, shortened"),
    dueDate: z.string().nullable().describe("Signing deadline, ISO 8601"),
    openUrl: url(),
  }),
  Offer: z.object({
    merchant: z.string(),
    headline: z.string().describe("The offer in a few words"),
    code: z.string().nullable().describe("Coupon or promo code"),
    discount: z.string().nullable().describe("e.g. 20% off, $10 off"),
    expiresAt: z.string().nullable().describe("ISO 8601"),
    terms: z.string().nullable().describe("Key conditions, shortened"),
    shopUrl: url(),
  }),
  Digest: z.object({
    publication: z.string(),
    items: z
      .array(
        z.object({
          title: z.string(),
          summary: z.string().nullable().describe("One sentence"),
          url: url(),
        }),
      )
      .describe("Top stories, most important first, at most 6"),
  }),
  DevNotification: z.object({
    platform: z.enum(DEV_PLATFORMS),
    kind: z.enum(DEV_KINDS),
    repository: z.string().nullable().describe("owner/repo or project key"),
    number: z.string().nullable().describe("PR, issue or ticket number"),
    title: z.string(),
    state: z.string().nullable().describe("merged, closed, failed, passed, review requested, …"),
    actor: z.string().nullable().describe("Who triggered it"),
    url: url(),
  }),
  Contact: z.object({
    name: z.string(),
    organization: z.string().nullable(),
    title: z.string().nullable().describe("Job title or role"),
    emails: z.array(z.string()).describe("Addresses only, no labels"),
    phones: z.array(z.string()).describe("Numbers as written, with country code when given"),
    addresses: z.array(z.string()).describe("One postal address per entry"),
    websiteUrl: url(),
    note: z.string().nullable().describe("Why this contact was shared, in a few words"),
  }),
} as const;

export type SummaryCardType = keyof typeof summaryCardProps;
export type SummaryCardProps<K extends SummaryCardType> = z.infer<(typeof summaryCardProps)[K]>;

export const summaryCardSchema = z.discriminatedUnion("type", [
  summaryCardProps.Tldr.extend({ type: z.literal("Tldr") }),
  summaryCardProps.Otp.extend({ type: z.literal("Otp") }),
  summaryCardProps.Meeting.extend({ type: z.literal("Meeting") }),
  summaryCardProps.Order.extend({ type: z.literal("Order") }),
  summaryCardProps.Shipment.extend({ type: z.literal("Shipment") }),
  summaryCardProps.Bill.extend({ type: z.literal("Bill") }),
  summaryCardProps.Reservation.extend({ type: z.literal("Reservation") }),
  summaryCardProps.Contact.extend({ type: z.literal("Contact") }),
  summaryCardProps.Transaction.extend({ type: z.literal("Transaction") }),
  summaryCardProps.Subscription.extend({ type: z.literal("Subscription") }),
  summaryCardProps.ActionLink.extend({ type: z.literal("ActionLink") }),
  summaryCardProps.SecurityAlert.extend({ type: z.literal("SecurityAlert") }),
  summaryCardProps.SharedDocument.extend({
    type: z.literal("SharedDocument"),
  }),
  summaryCardProps.Offer.extend({ type: z.literal("Offer") }),
  summaryCardProps.Digest.extend({ type: z.literal("Digest") }),
  summaryCardProps.DevNotification.extend({
    type: z.literal("DevNotification"),
  }),
]);
export type SummaryCard = z.infer<typeof summaryCardSchema>;

export function summaryOutputSchemaFor(types: readonly SummaryCardType[] | null) {
  const allowed = summaryCardSchema.options.filter(
    (option) =>
      option.shape.type.value === "Tldr" ||
      types === null ||
      types.includes(option.shape.type.value),
  );
  const [first, ...rest] = allowed;
  const card = first && isNonEmpty(rest) ? z.discriminatedUnion("type", [first, ...rest]) : first;
  if (!card) throw new Error("[summary] no card type is allowed");
  return z.object({
    card: card
      .nullable()
      .describe(
        "The conversation's one summary card: a detail card when the conversation is about exactly one such item, otherwise a Tldr; null only for automated mail no type fits",
      ),
  });
}

export interface SummaryOutput {
  card: SummaryCard | null;
}

export function cardsFromOutput(output: SummaryOutput): SummaryCard[] {
  return output.card ? [output.card] : [];
}

export function outputFromCards(cards: readonly SummaryCard[]): SummaryOutput {
  return { card: cards[0] ?? null };
}

export const summaryCatalog = defineCatalog(schema, {
  components: {
    Stack: { props: z.object({}), slots: ["default"] },
    Tldr: { props: summaryCardProps.Tldr },
    Otp: { props: summaryCardProps.Otp },
    Meeting: { props: summaryCardProps.Meeting },
    Order: { props: summaryCardProps.Order },
    Shipment: { props: summaryCardProps.Shipment },
    Bill: { props: summaryCardProps.Bill },
    Reservation: { props: summaryCardProps.Reservation },
    Contact: { props: summaryCardProps.Contact },
    Transaction: { props: summaryCardProps.Transaction },
    Subscription: { props: summaryCardProps.Subscription },
    ActionLink: { props: summaryCardProps.ActionLink },
    SecurityAlert: { props: summaryCardProps.SecurityAlert },
    SharedDocument: { props: summaryCardProps.SharedDocument },
    Offer: { props: summaryCardProps.Offer },
    Digest: { props: summaryCardProps.Digest },
    DevNotification: { props: summaryCardProps.DevNotification },
  },
  actions: {},
});

export const summarySpecSchema = summaryCatalog.zodSchema() as z.ZodType<Spec>;

export function buildSummarySpec(cards: SummaryCard[]): Spec {
  const children: string[] = [];
  const elements: Spec["elements"] = {};
  cards.forEach((card, i) => {
    const { type, ...props } = card;
    const key = `${type.toLowerCase()}-${i}`;
    children.push(key);
    elements[key] = { type, props, children: [] };
  });
  elements.root = { type: "Stack", props: {}, children };
  return { root: "root", elements };
}
