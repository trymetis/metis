import { displayNameOf } from "@/contacts/fields";
import type { ContactDraft } from "@/contacts/types";
import { buildVCard } from "@/contacts/vcard-write";

function fileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\p{Cc}]+/gu, "").replace(/^[\s.]+|[\s.]+$/g, "");
}

export function downloadVcard(draft: ContactDraft, uid: string) {
  const blob = new Blob([buildVCard(draft, uid)], { type: "text/vcard" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${fileName(displayNameOf(draft)) || "contact"}.vcf`;
  link.click();
  URL.revokeObjectURL(href);
}
