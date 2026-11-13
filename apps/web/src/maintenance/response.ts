import "server-only";
import { NextResponse } from "next/server";

import { config } from "@/config";
import { sourceInfo } from "@/source-info";

const RETRY_AFTER_SECONDS = "300";
const MAINTENANCE_PAGE = "/maintenance";

export function maintenanceResponse(html: boolean, url: string): Response | null {
  const { since } = config.maintenance;
  if (!(since instanceof Date)) return null;
  const iso = since.toISOString();
  const headers = new Headers({
    "Retry-After": RETRY_AFTER_SECONDS,
    "Cache-Control": "no-store",
    "Metis-Maintenance": iso,
    "Metis-Version": sourceInfo().version,
  });
  if (html) return NextResponse.rewrite(new URL(MAINTENANCE_PAGE, url), { headers });
  return Response.json({ error: "maintenance", since: iso }, { status: 503, headers });
}
