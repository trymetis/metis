import { headers as nextHeaders } from "next/headers";

import { originalDownload } from "@/mail/pages/original";
import { originalPage } from "@/mail/pages/original-page";
import { readPageSource } from "@/mail/pages/source";

export async function GET(
  request: Request,
  { params }: RouteContext<"/w/[slug]/m/[mailbox]/original">,
) {
  const { slug, mailbox } = await params;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const raw = await readPageSource(await nextHeaders(), slug, mailbox, id);
  if (raw instanceof Response) return raw;
  if (url.searchParams.has("download")) return originalDownload(raw);
  return originalPage(raw, `?${new URLSearchParams({ id: id ?? "", download: "1" })}`);
}
