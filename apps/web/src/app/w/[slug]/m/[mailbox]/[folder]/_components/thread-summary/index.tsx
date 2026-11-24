"use client";

import type { Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { ChevronUp } from "lucide-react";
import { useMemo } from "react";

import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { isRecord } from "@/lib/guards";
import { summaryCatalog } from "@/mail/summary-catalog";

import { ActionLinkCard } from "./action-link-card";
import { BillCard } from "./bill-card";
import { ContactCard } from "./contact-card";
import { DevNotificationCard } from "./dev-notification-card";
import { DigestCard } from "./digest-card";
import { MeetingCard } from "./meeting-card";
import { OfferCard } from "./offer-card";
import { OrderCard } from "./order-card";
import { OtpCard } from "./otp-card";
import { ReservationCard } from "./reservation-card";
import { SecurityAlertCard } from "./security-alert-card";
import { SharedDocumentCard } from "./shared-document-card";
import { ShipmentCard } from "./shipment-card";
import { SubscriptionCard } from "./subscription-card";
import { SummaryCard } from "./summary-card";
import { type SummaryActions, SummaryActionsProvider } from "./summary-context";
import { SummaryPeek } from "./summary-peek";
import { TransactionCard } from "./transaction-card";

export type { SummaryActions } from "./summary-context";

const EXPANDED_KEY = "metis:mail-summary-expanded";

const { registry } = defineRegistry(summaryCatalog, {
  components: {
    Stack: ({ children }) => <div className="mt-1.5 mb-4 space-y-2">{children}</div>,
    Summary: ({ props }) => <SummaryCard props={props} />,
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
  },
});

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
  if (!expanded) {
    return <SummaryPeek spec={cleaned} onExpand={() => writeStoredItem(EXPANDED_KEY, "1")} />;
  }
  return (
    <SummaryActionsProvider value={actions}>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => writeStoredItem(EXPANDED_KEY, null)}
          aria-expanded={true}
          className="flex items-center gap-1 text-[11px] text-faint hover:text-foreground"
        >
          Show less
          <ChevronUp aria-hidden className="size-3" />
        </button>
      </div>
      <JSONUIProvider registry={registry}>
        <Renderer spec={cleaned} registry={registry} />
      </JSONUIProvider>
    </SummaryActionsProvider>
  );
}
