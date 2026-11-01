import { headers as nextHeaders } from "next/headers";

import { config } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import { printPage } from "@/mail/pages/print-page";
import { readPageSource } from "@/mail/pages/source";

export async function GET(
  request: Request,
  { params }: RouteContext<"/w/[slug]/m/[mailbox]/print">,
) {
  const { slug, mailbox } = await params;
  const url = new URL(request.url);
  const raw = await readPageSource(await nextHeaders(), slug, mailbox, url.searchParams.get("id"));
  if (raw instanceof Response) return raw;
  const shown = url.searchParams.get("images") === "shown";
  return printPage(raw, {
    images: !shown ? "block" : getInstanceConfig().imageProxy.enabled ? "proxy" : "load",
    cleanLinks: url.searchParams.get("links") !== "keep",
    origin: new URL(config.auth.url).origin,
    timeZone: url.searchParams.get("tz"),
  });
}
