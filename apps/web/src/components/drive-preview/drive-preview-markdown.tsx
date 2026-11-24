"use client";

import { marked } from "marked";
import { useEffect, useRef, useState } from "react";

import { decodeUtf8 } from "@/drive/preview";
import { sanitizeHtml } from "@/lib/sanitize-html";

import { DrivePreviewLoading } from "./drive-preview-loading";

function renderMarkdown(buffer: ArrayBuffer): string | null {
  const text = decodeUtf8(new Uint8Array(buffer), false);
  if (text === null) return null;
  return sanitizeHtml(marked.parse(text, { gfm: true, async: false }));
}

export function DrivePreviewMarkdown({ blob, onFail }: { blob: Blob; onFail: () => void }) {
  const [rendered, setRendered] = useState<{ blob: Blob; html: string } | null>(null);
  const html = rendered?.blob === blob ? rendered.html : null;
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    blob
      .arrayBuffer()
      .then((buffer) => {
        if (!active) return;
        const safe = renderMarkdown(buffer);
        if (safe === null) onFail();
        else setRendered({ blob, html: safe });
      })
      .catch(() => active && onFail());
    return () => {
      active = false;
    };
  }, [blob, onFail]);

  useEffect(() => {
    if (html === null) return;
    for (const link of container.current?.querySelectorAll("a") ?? []) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }, [html]);

  if (html === null) return <DrivePreviewLoading />;

  return (
    <div className="h-full overflow-auto">
      <div
        ref={container}
        className="markdown-body mx-auto max-w-3xl px-8 py-6 text-[14px] leading-6 text-foreground"
        // oxlint-disable-next-line react/no-danger --sanitized via sanitizeHtml in renderMarkdown
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
