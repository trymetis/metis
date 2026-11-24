"use client";

import { Button } from "@metis/ui/components/button";
import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

interface BackupCodesCardProps {
  codes: string[];
  accountEmail: string;
}

export function BackupCodesCard({ codes, accountEmail }: BackupCodesCardProps) {
  const [copied, setCopied] = useState(false);

  if (codes.length === 0) return null;

  function downloadCodes() {
    const content = `Metis Suite 2FA backup codes\nAccount: ${accountEmail}\nEach code can be used once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "metis-suite-backup-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft p-3">
      <p className="text-xs font-semibold text-brand-text">Save these backup codes</p>
      <p className="mt-1 text-[11px] text-brand-text">
        Each can be used once if you can't use your authenticator app or passkey.
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-brand-text">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={downloadCodes}>
          <Download data-icon="inline-start" />
          Download .txt
        </Button>
        <Button size="sm" variant="outline" onClick={copyCodes}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
