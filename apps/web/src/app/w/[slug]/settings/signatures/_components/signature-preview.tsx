"use client";

import { useMemo } from "react";

import { sanitizeSignatureHtml } from "@/lib/sanitize-html";
import { fillSignatureVariables, type SignatureVariables } from "@/mail/signature-markup";

export function SignaturePreview({ html, vars }: { html: string; vars: SignatureVariables }) {
  const clean = useMemo(
    () => sanitizeSignatureHtml(fillSignatureVariables(html, vars)),
    [html, vars],
  );
  if (!clean) return <p className="text-[12px] text-faint">Nothing yet.</p>;
  return (
    <div
      className="max-h-48 overflow-auto rounded-lg border border-border-soft bg-white px-3 py-2 text-[13px] text-black"
      // oxlint-disable-next-line react/no-danger --sanitized via sanitizeSignatureHtml
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
