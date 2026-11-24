import { cn } from "@metis/ui/lib/utils";

import { paletteText } from "@/lib/palette";

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const second = words.length > 1 ? (words[1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export function PersonAvatar({
  name,
  email,
  photoUrl,
  className,
}: {
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // oxlint-disable-next-line nextjs/no-img-element -- provider photo URLs; next/image adds nothing here
      <img
        src={photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full border border-border object-cover", className)}
      />
    );
  }
  const label = name.trim() || email || "";
  const color = paletteText((email || label).toLowerCase());
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium select-none",
        className,
      )}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {initials(label)}
    </span>
  );
}
