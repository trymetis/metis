"use client";

import { useEffect, useState } from "react";

const POLL_MS = 30_000;
const MINUTE = 60_000;

function duration(ms: number): string {
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 1) return "less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  return `${rest} min`;
}

async function unchanged(since: string): Promise<boolean> {
  try {
    const response = await fetch(window.location.href, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
    });
    const current = response.headers.get("Metis-Maintenance");
    return current !== null && Date.parse(current) === Date.parse(since);
  } catch {
    return true;
  }
}

export function MaintenanceStatus({ since, sinceText }: { since: string; sinceText: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), MINUTE / 2);
    const poll = setInterval(() => {
      void unchanged(since).then((same) => {
        if (!same) window.location.reload();
      });
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [since]);

  return (
    <>
      <p className="mt-1.5 text-sm text-neutral-500" suppressHydrationWarning>
        Down for {duration(now - Date.parse(since))}. {sinceText}.
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        This page reloads by itself when the app is back. Contact your administrator if this takes
        longer than expected.
      </p>
    </>
  );
}
