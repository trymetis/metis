"use client";

import type { Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

import { IconButton } from "@/components/icon-button";
import { useMailPrivacy } from "@/hooks/use-mail-privacy";
import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { isRecord } from "@/lib/guards";
import { cleanUrl as cleanTrackedUrl } from "@/mail/render/pipeline";
import {
  buildSummarySpec,
  type SummaryCard as SummaryCardData,
  summaryCatalog,
} from "@/mail/summary-catalog";

import { ActionLinkCard, ActionLinkCompact } from "./action-link-card";
import { BillCard, BillCompact } from "./bill-card";
import { CollapseContext } from "./card-parts";
import { ContactCard, ContactCompact } from "./contact-card";
import { DevNotificationCard, DevNotificationCompact } from "./dev-notification-card";
import { DigestCard, DigestCompact } from "./digest-card";
import { MeetingCard, MeetingCompact } from "./meeting-card";
import { OfferCard, OfferCompact } from "./offer-card";
import { OrderCard, OrderCompact } from "./order-card";
import { OtpCard, OtpCompact } from "./otp-card";
import { ReservationCard, ReservationCompact } from "./reservation-card";
import { SecurityAlertCard, SecurityAlertCompact } from "./security-alert-card";
import { SharedDocumentCard, SharedDocumentCompact } from "./shared-document-card";
import { ShipmentCard, ShipmentCompact } from "./shipment-card";
import { SubscriptionCard, SubscriptionCompact } from "./subscription-card";
import { type SummaryActions, SummaryActionsProvider } from "./summary-context";
import { TldrCard, TldrCompact } from "./tldr-card";
import { TransactionCard, TransactionCompact } from "./transaction-card";

export type { SummaryActions } from "./summary-context";

const EXPANDED_KEY = "metis:mail-summary-expanded";

const { registry } = defineRegistry(summaryCatalog, {
  components: {
    Stack: ({ children }) => <div className="my-4">{children}</div>,
    Otp: ({ props }) => <OtpCard props={props} />,
    ActionLink: ({ props }) => <ActionLinkCard props={props} />,
    SecurityAlert: ({ props }) => <SecurityAlertCard props={props} />,
    Meeting: ({ props }) => <MeetingCard props={props} />,
    Order: ({ props }) => <OrderCard props={props} />,
    Shipment: ({ props }) => <ShipmentCard props={props} />,
    Transaction: ({ props }) => <TransactionCard props={props} />,
    Bill: ({ props }) => <BillCard props={props} />,
    Subscription: ({ props }) => <SubscriptionCard props={props} />,
    Reservation: ({ props }) => <ReservationCard props={props} />,
    SharedDocument: ({ props }) => <SharedDocumentCard props={props} />,
    Offer: ({ props }) => <OfferCard props={props} />,
    Digest: ({ props }) => <DigestCard props={props} />,
    DevNotification: ({ props }) => <DevNotificationCard props={props} />,
    Contact: ({ props }) => <ContactCard props={props} />,
    Tldr: ({ props }) => <TldrCard props={props} />,
  },
});

const { registry: compactRegistry } = defineRegistry(summaryCatalog, {
  components: {
    Stack: ({ children }) => <>{children}</>,
    ActionLink: ({ props }) => <ActionLinkCompact props={props} />,
    Bill: ({ props }) => <BillCompact props={props} />,
    Contact: ({ props }) => <ContactCompact props={props} />,
    DevNotification: ({ props }) => <DevNotificationCompact props={props} />,
    Digest: ({ props }) => <DigestCompact props={props} />,
    Meeting: ({ props }) => <MeetingCompact props={props} />,
    Offer: ({ props }) => <OfferCompact props={props} />,
    Order: ({ props }) => <OrderCompact props={props} />,
    Otp: ({ props }) => <OtpCompact props={props} />,
    Reservation: ({ props }) => <ReservationCompact props={props} />,
    SecurityAlert: ({ props }) => <SecurityAlertCompact props={props} />,
    SharedDocument: ({ props }) => <SharedDocumentCompact props={props} />,
    Shipment: ({ props }) => <ShipmentCompact props={props} />,
    Subscription: ({ props }) => <SubscriptionCompact props={props} />,
    Tldr: ({ props }) => <TldrCompact props={props} />,
    Transaction: ({ props }) => <TransactionCompact props={props} />,
  },
});

export function useSummaryUrlCleaner(): ((url: string) => string) | undefined {
  const privacy = useMailPrivacy();
  const linkRules = privacy.cleanLinks ? (privacy.rules?.links ?? null) : null;
  return useMemo(
    () => (linkRules ? (url: string) => cleanTrackedUrl(url, linkRules) : undefined),
    [linkRules],
  );
}

export function SummaryCardCompact({
  card,
  cleanUrl,
}: {
  card: SummaryCardData;
  cleanUrl?: (url: string) => string;
}) {
  const spec = useMemo(() => {
    const built = buildSummarySpec([card]);
    return cleanUrl ? cleanSpecUrls(built, cleanUrl) : built;
  }, [card, cleanUrl]);
  return (
    <JSONUIProvider registry={compactRegistry}>
      <Renderer spec={spec} registry={compactRegistry} />
    </JSONUIProvider>
  );
}

function isUrlKey(key: string): boolean {
  return key === "url" || key.endsWith("Url");
}

function mapUrls(value: unknown, clean: (url: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapUrls(v, clean));
  return isRecord(value) ? mapRecordUrls(value, clean) : value;
}

function mapRecordUrls(
  value: Record<string, unknown>,
  clean: (url: string) => string,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    next[key] = isUrlKey(key) && typeof inner === "string" ? clean(inner) : mapUrls(inner, clean);
  }
  return next;
}

function cleanSpecUrls(spec: Spec, clean: (url: string) => string): Spec {
  const elements: Spec["elements"] = {};
  for (const [id, element] of Object.entries(spec.elements)) {
    elements[id] = { ...element, props: mapRecordUrls(element.props, clean) };
  }
  return { ...spec, elements };
}

export function ThreadSummaryCards({
  spec,
  actions,
  cleanUrl,
}: {
  spec: Spec;
  actions: SummaryActions;
  cleanUrl?: (url: string) => string;
}) {
  const cleaned = useMemo(
    () => (cleanUrl ? cleanSpecUrls(spec, cleanUrl) : spec),
    [spec, cleanUrl],
  );
  const expanded = useStoredItem(EXPANDED_KEY) === "1";
  const hasCard = (cleaned.elements[cleaned.root]?.children?.length ?? 0) > 0;
  if (!hasCard) return null;
  if (expanded) {
    return (
      <SummaryActionsProvider value={actions}>
        <CollapseContext value={() => writeStoredItem(EXPANDED_KEY, null)}>
          <section aria-label="Summary">
            <JSONUIProvider registry={registry}>
              <Renderer spec={cleaned} registry={registry} />
            </JSONUIProvider>
          </section>
        </CollapseContext>
      </SummaryActionsProvider>
    );
  }
  return (
    <SummaryActionsProvider value={actions}>
      <section aria-label="Summary" className="my-4 flex items-center gap-2">
        <JSONUIProvider registry={compactRegistry}>
          <Renderer spec={cleaned} registry={compactRegistry} />
        </JSONUIProvider>
        <IconButton
          label="Show summary"
          size="icon-xs"
          aria-expanded={false}
          onClick={() => writeStoredItem(EXPANDED_KEY, "1")}
        >
          <ChevronDown className="size-3.5 text-primary" />
        </IconButton>
      </section>
    </SummaryActionsProvider>
  );
}
