import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  BellOff,
  Bot,
  BrainCircuit,
  CalendarCheck,
  CalendarClock,
  CalendarCog,
  CalendarPlus,
  CalendarRange,
  CalendarSearch,
  CalendarX,
  Clock,
  Copy,
  Download,
  FileDown,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  Files,
  Filter,
  FolderInput,
  FolderPlus,
  FolderSync,
  Forward,
  GitBranch,
  GitMerge,
  Hourglass,
  Inbox,
  ListChecks,
  ListTree,
  type LucideIcon,
  MailCheck,
  MailOpen,
  MailPlus,
  MailSearch,
  Merge,
  MessageCircleQuestion,
  MessagesSquare,
  OctagonX,
  PenLine,
  Pencil,
  PhoneCall,
  Play,
  IterationCcw,
  Repeat,
  Reply,
  Rows3,
  Save,
  ScanText,
  Send,
  SendHorizontal,
  ShieldAlert,
  Signpost,
  Sparkles,
  Split,
  SquareFunction,
  Star,
  Tag,
  Tags,
  TextQuote,
  Timer,
  Trash2,
  Undo2,
  UserCheck,
  UserPlus,
  UserRoundPlus,
  Variable,
  Webhook,
  Workflow,
  Wrench,
  TriangleAlert,
} from "lucide-react";

import type { StepCategory, StepKey } from "@/workflow/steps";
import { isStepKey } from "@/workflow/steps";
import type { ValueType } from "@/workflow/values";

export const STEP_ICONS: Record<StepKey, LucideIcon> = {
  "trigger.manual": Play,
  "trigger.schedule": CalendarClock,
  "trigger.once": AlarmClock,
  "trigger.call": PhoneCall,
  "trigger.webhook": Webhook,
  "trigger.mail.received": MailPlus,
  "trigger.mail.sent": Send,
  "trigger.mail.starred": Star,
  "trigger.mail.labelled": Tag,
  "trigger.mail.beforeSend": SendHorizontal,
  "trigger.calendar.created": CalendarPlus,
  "trigger.calendar.updated": CalendarCog,
  "trigger.calendar.cancelled": CalendarX,
  "trigger.calendar.invited": CalendarCheck,
  "trigger.calendar.rsvp": UserCheck,
  "trigger.calendar.starting": Timer,
  "trigger.calendar.ended": CalendarRange,
  "trigger.drive.added": FilePlus,
  "trigger.drive.changed": FilePen,
  "trigger.app.runFailed": TriangleAlert,
  "trigger.app.phishing": ShieldAlert,
  "trigger.app.aiLabel": Tags,
  "trigger.app.memberJoined": UserPlus,
  "mail.get": MailOpen,
  "mail.list": Inbox,
  "mail.search": MailSearch,
  "mail.thread": MessagesSquare,
  "mail.markRead": MailCheck,
  "mail.star": Star,
  "mail.label": Tag,
  "mail.mute": BellOff,
  "mail.archive": Archive,
  "mail.trash": Trash2,
  "mail.toInbox": ArchiveRestore,
  "mail.draft": PenLine,
  "mail.send": Send,
  "mail.reply": Reply,
  "mail.forward": Forward,
  "mail.addBcc": UserRoundPlus,
  "mail.sendScheduled": SendHorizontal,
  "mail.saveAttachment": Save,
  "mail.saveEml": FileDown,
  "logic.if": Split,
  "logic.switch": GitBranch,
  "logic.filter": Filter,
  "logic.split": Rows3,
  "logic.aggregate": ListTree,
  "logic.merge": Merge,
  "logic.join": GitMerge,
  "logic.set": Variable,
  "logic.stop": OctagonX,
  "flow.delay": Hourglass,
  "flow.waitUntil": Clock,
  "flow.waitFor": Timer,
  "flow.approval": ListChecks,
  "flow.call": Workflow,
  "flow.loop": Repeat,
  "flow.endLoop": IterationCcw,
  "flow.return": Undo2,
  "ai.ask": MessageCircleQuestion,
  "ai.branch": Signpost,
  "ai.generate": Sparkles,
  "ai.extract": ScanText,
  "ai.summarize": TextQuote,
  "ai.classify": BrainCircuit,
  "ai.agent": Bot,
  "calendar.list": CalendarRange,
  "calendar.get": CalendarSearch,
  "calendar.create": CalendarPlus,
  "calendar.update": CalendarCog,
  "calendar.delete": CalendarX,
  "calendar.respond": CalendarCheck,
  "calendar.freeTime": CalendarClock,
  "calendar.importIcs": CalendarPlus,
  "drive.list": Files,
  "drive.search": FileSearch,
  "drive.get": FileText,
  "drive.readText": ScanText,
  "drive.download": Download,
  "drive.write": FilePlus,
  "drive.createFolder": FolderPlus,
  "drive.move": FolderInput,
  "drive.rename": Pencil,
  "drive.copy": Copy,
  "drive.delete": Trash2,
  "system.cimdPrune": Wrench,
  "system.auditPrune": Wrench,
  "system.mailCachePrune": Wrench,
  "system.workflowPrune": FolderSync,
};

export const CATEGORY_BADGE: Record<StepCategory, string> = {
  trigger: "bg-primary text-primary-foreground",
  mail: "bg-(--label-custom-blue-mark) text-white",
  calendar: "bg-(--label-custom-orange-mark) text-white",
  drive: "bg-(--label-custom-amber-mark) text-white",
  logic: "bg-(--label-custom-purple-mark) text-white",
  flow: "bg-(--label-custom-navy-mark) text-white",
  ai: "bg-(--label-custom-teal-mark) text-white",
  system: "bg-(--label-custom-gray-mark) text-white",
};

export const CATEGORY_COLOR: Record<StepCategory, string> = {
  trigger: "var(--primary)",
  mail: "var(--label-custom-blue-mark)",
  calendar: "var(--label-custom-orange-mark)",
  drive: "var(--label-custom-amber-mark)",
  logic: "var(--label-custom-purple-mark)",
  flow: "var(--label-custom-navy-mark)",
  ai: "var(--label-custom-teal-mark)",
  system: "var(--label-custom-gray-mark)",
};

export type PortTone = "mail" | "calendar" | "drive" | "value" | "any";

export const PORT_HANDLE: Record<PortTone, string> = {
  mail: "!bg-(--label-custom-blue-mark)",
  calendar: "!bg-(--label-custom-orange-mark)",
  drive: "!bg-(--label-custom-amber-mark)",
  value: "!bg-primary",
  any: "!bg-muted-foreground",
};

export function portTone(type: ValueType | null): PortTone {
  if (!type) return "any";
  const base = type.kind === "list" ? type.of : type;
  switch (base.kind) {
    case "mail":
    case "thread":
    case "draft":
    case "attachment":
      return "mail";
    case "event":
    case "attendee":
      return "calendar";
    case "file":
    case "folder":
    case "blob":
      return "drive";
    case "json":
      return "any";
    default:
      return "value";
  }
}

export function NodeIcon({ step, className }: { step: string; className?: string }) {
  const Icon = isStepKey(step) ? STEP_ICONS[step] : SquareFunction;
  return <Icon className={className} />;
}
