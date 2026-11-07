import { cn } from "@metis/ui/lib/utils";
import {
  BookUser,
  CalendarClock,
  CalendarDays,
  File,
  Folder,
  HardDrive,
  Inbox,
  Mail,
  Tag,
  User,
  UserRound,
} from "lucide-react";
import type { ComponentType } from "react";

import type { ReferenceType } from "@/ai/references";

const ICONS: Record<ReferenceType, ComponentType<{ className?: string }>> = {
  mailbox: Inbox,
  calendar: CalendarDays,
  drive: HardDrive,
  member: User,
  email: Mail,
  event: CalendarClock,
  label: Tag,
  folder: Folder,
  file: File,
  addressbook: BookUser,
  contact: UserRound,
};

export function ReferenceIcon({ type, className }: { type: ReferenceType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}

export function ReferenceChip({
  type,
  label,
  title,
  className,
}: {
  type: ReferenceType;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[18rem] select-none items-center gap-1 rounded-md border border-brand-soft bg-brand-soft px-1.5 py-px align-baseline font-medium text-[0.9em] text-brand-text leading-snug",
        className,
      )}
      data-reference-chip={type}
      title={title ?? label}
    >
      <ReferenceIcon className="size-3 shrink-0 opacity-70" type={type} />
      <span className="truncate">{label}</span>
    </span>
  );
}
