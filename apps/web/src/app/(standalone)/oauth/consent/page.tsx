"use client";

import { Suspense } from "react";

import { ConsentInner } from "./_components/consent-inner";

export default function OAuthConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      }
    >
      <ConsentInner />
    </Suspense>
  );
}
