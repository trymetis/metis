"use client";

import { Button } from "@metis/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@metis/ui/components/popover";
import { cn } from "@metis/ui/lib/utils";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmailFrame } from "@/components/email-frame";
import type { MessageBody } from "@/hooks/use-email-detail";
import type { RenderedEmail } from "@/mail/render/pipeline";
import type { RemoteImages } from "@/mail/render/types";
import type { RemoteAllowInput } from "@/server/schema";
import { senderDomain, useMailPrivacyStore } from "@/store/mail-privacy-store";

export function RemoteImagesChip({
  count,
  sender,
  messageId,
  proxied,
  className,
}: {
  count: number;
  sender: string;
  messageId: string;
  proxied: boolean;
  className?: string;
}) {
  const loadOnce = useMailPrivacyStore((s) => s.loadOnce);
  const allowRemote = useMailPrivacyStore((s) => s.allowRemote);
  const [busy, setBusy] = useState(false);
  const address = sender.trim().toLowerCase();
  const domain = senderDomain(address);

  async function trust(input: RemoteAllowInput) {
    setBusy(true);
    try {
      await allowRemote(input);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that choice");
    } finally {
      setBusy(false);
    }
  }

  const label = `${count} remote ${count === 1 ? "image" : "images"} blocked`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            aria-label={label}
            title={label}
            className={cn("rounded-full bg-surface text-[11px] text-muted-foreground", className)}
          />
        }
      >
        <ImageOff className="size-3" />
        {count}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle className="text-[13px]">{label}</PopoverTitle>
          <PopoverDescription className="text-[12px]">
            Remote images can tell the sender when and where you opened this message.
            {proxied &&
              " They load through this server, which hides your address but not the open itself."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col items-start gap-1.5">
          <Button size="xs" variant="outline" disabled={busy} onClick={() => loadOnce(messageId)}>
            Load images
          </Button>
          {address.includes("@") && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              className="max-w-full"
              onClick={() => trust({ kind: "address", value: address })}
            >
              <span className="truncate">Always from {address}</span>
            </Button>
          )}
          {domain && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              className="max-w-full"
              onClick={() => trust({ kind: "domain", value: domain })}
            >
              <span className="truncate">Always from {domain}</span>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MessageContent({
  body,
  rendered,
  images,
  proxyEndpoint,
  messageId,
  title,
  className,
  frameClassName,
  textClassName,
  onBlockedImages,
}: {
  body: MessageBody | null;
  rendered: RenderedEmail | null;
  images: RemoteImages;
  proxyEndpoint: string | null;
  messageId: string;
  title?: string;
  className?: string;
  frameClassName?: string;
  textClassName?: string;
  onBlockedImages?: (count: number) => void;
}) {
  const [blocked, setBlocked] = useState(0);
  const countKey = `${messageId} ${images}`;
  const [countFor, setCountFor] = useState(countKey);
  const loadOnce = useMailPrivacyStore((s) => s.loadOnce);

  if (countFor !== countKey) {
    setCountFor(countKey);
    setBlocked(0);
  }

  const blockedCount =
    images === "block" && body?.kind === "html" && rendered ? rendered.remoteImages + blocked : 0;
  useEffect(() => {
    onBlockedImages?.(blockedCount);
  }, [blockedCount, onBlockedImages]);

  if (!body) return null;
  if (body.kind === "error") {
    return <p className="text-sm italic text-faint">Could not load this message.</p>;
  }
  if (body.kind === "empty") {
    return <p className="text-sm italic text-faint">No content</p>;
  }
  if (body.kind === "text") {
    return (
      <div
        className={cn("whitespace-pre-wrap wrap-break-word text-muted-foreground", textClassName)}
      >
        {body.text}
      </div>
    );
  }
  if (!rendered) {
    return (
      <div className={cn("space-y-3", frameClassName)}>
        {[90, 75, 82].map((w) => (
          <div key={w} className="h-4 animate-pulse rounded bg-hover" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <EmailFrame
        key={messageId}
        title={title}
        html={rendered.html}
        images={images}
        proxyEndpoint={proxyEndpoint}
        adaptive={rendered.adaptive}
        className={frameClassName}
        onBlockedImages={images === "block" ? (urls) => setBlocked(urls.size) : undefined}
        onLoadImages={images === "block" ? () => loadOnce(messageId) : undefined}
      />
    </div>
  );
}
