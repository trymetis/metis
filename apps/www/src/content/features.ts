import {
  AlarmClock,
  ArrowDownUp,
  Bookmark,
  BookLock,
  BookUser,
  Bot,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Command,
  Eye,
  EyeOff,
  FileSearch,
  Filter,
  FolderPlus,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  IdCard,
  ImageOff,
  Inbox,
  Keyboard,
  Layers,
  LayoutGrid,
  Link2,
  type LucideIcon,
  MailMinus,
  MessageSquareReply,
  MessagesSquare,
  MousePointerClick,
  Move,
  Palette,
  Paperclip,
  PenLine,
  Pin,
  Repeat,
  Search,
  Send,
  Share2,
  Sparkles,
  SquareDashed,
  Tags,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Workflow,
} from "lucide-react";
import type { Route } from "next";

import { MORE_AREAS } from "./features-more";

export type Feature = {
  icon: LucideIcon;
  t: string;
  d: string;
  tag?: string;
  shot?: string;
};

export type Area = {
  kicker: string;
  title: [string, string];
  lede: string;
  href?: Route;
  features: Feature[];
};

const AI = "AI, opt in";
export const CORE_AREAS = {
  mail: {
    kicker: "Mail",
    title: ["Every inbox,", "one calm list."],
    lede: "Gmail, Outlook, Zoho Mail and IMAP in one place, with summaries, sorting and privacy built in.",
    href: "/mail",
    features: [
      {
        icon: Layers,
        t: "Gmail, Outlook, Zoho and IMAP",
        shot: "mail/providers",
        d: "Google and Microsoft 365 accounts, Zoho Mail, and any IMAP server the instance owner adds.",
      },
      {
        icon: Inbox,
        t: "All inboxes in one list",
        shot: "mail/all-inboxes",
        d: "Every mailbox in the workspace merged and sorted newest first.",
      },
      {
        icon: Send,
        t: "Send from any address",
        shot: "mail/send-from",
        d: "Pick which mailbox a message goes out from, right in the composer.",
      },
      {
        icon: Users,
        t: "Shared team mailboxes",
        shot: "mail/shared",
        d: "Add a mailbox to a workspace and every member can use it.",
      },
      {
        icon: MessagesSquare,
        t: "Real conversations",
        shot: "mail/threads",
        d: "Messages grouped into threads, with earlier replies opening inline.",
      },
      {
        icon: Tags,
        t: "Smart tabs and labels",
        shot: "mail/labels",
        d: "Primary hides promotions, social and newsletters. Eight built-in labels plus your own colors.",
      },
      {
        icon: Search,
        t: "Search and bulk actions",
        shot: "mail/bulk",
        d: "Search the list, then mark, label or delete many messages at once, with undo.",
      },
      {
        icon: AlarmClock,
        t: "Snooze",
        shot: "mail/snooze",
        d: "From later today to next week, with a Snoozed page to wake a thread early.",
      },
      {
        icon: Bookmark,
        t: "Read later and mute",
        shot: "mail/read-later",
        d: "A saved list only you see, and threads you can mute just for yourself.",
      },
      {
        icon: PenLine,
        t: "A proper composer",
        shot: "mail/send-from",
        d: "Formatting, links, Cc and Bcc, suggestions from your contacts, teammates and past mail, and drafts that save as you type.",
      },
      {
        icon: BookUser,
        t: "Save senders as contacts",
        shot: "mail/save-contact",
        d: "Add anyone on a message to an address book you pick, and open the contact for anyone already saved.",
      },
      {
        icon: Undo2,
        t: "Undo send",
        d: "Five seconds to take a message back after you hit send.",
      },
      {
        icon: CalendarDays,
        t: "Schedule send",
        shot: "mail/schedule",
        d: "Send at any date and time, with a Scheduled page to cancel or retry.",
      },
      {
        icon: Paperclip,
        t: "Attachments and drives",
        shot: "mail/attachments",
        d: "Send up to 25 MB, save attachments to a drive, or insert a drive link.",
      },
      {
        icon: Sparkles,
        t: "Thread summaries",
        shot: "mail/summary",
        d: "The point of the thread up top, plus cards for codes, meetings, packages, bills and people to save as contacts.",
        tag: AI,
      },
      {
        icon: MessageSquareReply,
        t: "Smart replies",
        shot: "mail/smart-replies",
        d: "Suggested replies in the tone of the message that open as an editable draft.",
        tag: AI,
      },
      {
        icon: PenLine,
        t: "Reply with a stance",
        shot: "mail/stance",
        d: "One click drafts to accept, decline politely, negotiate, buy time, clarify or defer.",
        tag: AI,
      },
      {
        icon: Bot,
        t: "Mail agent",
        shot: "mail/assistant",
        d: "Chat about your mailbox and drag emails in to ask about them.",
        tag: AI,
      },
      {
        icon: ImageOff,
        t: "Remote images blocked",
        shot: "mail/images",
        d: "Load them once, always for a trusted sender or domain, or always.",
      },
      {
        icon: EyeOff,
        t: "Trackers removed",
        shot: "mail/trackers",
        d: "Known tracking pixels are stripped, and a badge tells you who tried.",
      },
      {
        icon: Link2,
        t: "Links cleaned",
        d: "Tracking parameters removed and redirects unwrapped before you click.",
      },
      {
        icon: SquareDashed,
        t: "Safe to open",
        d: "Scripts and forms in an email never run, and web fonts never load.",
      },
      {
        icon: MailMinus,
        t: "Unsubscribe in bulk",
        shot: "mail/unsubscribe",
        d: "A Subscriptions page lists your newsletters so you can leave them in a few clicks.",
      },
      {
        icon: Keyboard,
        t: "Keyboard first",
        shot: "mail/shortcuts",
        d: "J and K move through mail, M then a key acts, and ? shows every shortcut.",
      },
      {
        icon: Globe,
        t: "Mail at your own domain",
        d: "Send and receive at your domain through Cloudflare Email or Resend.",
        tag: "Self-host",
      },
    ],
  },
  calendar: {
    kicker: "Calendar",
    title: ["Every calendar,", "one week."],
    lede: "Google Calendar, Outlook, Zoho Calendar and CalDAV side by side, with real editing and an agent that finds the free hour.",
    href: "/calendar",
    features: [
      {
        icon: Layers,
        t: "Google, Outlook, Zoho and CalDAV",
        shot: "calendar/sources",
        d: "Google, Outlook and Zoho calendars come with the account you connect. CalDAV servers are added by the instance owner.",
      },
      {
        icon: CalendarRange,
        t: "All calendars together",
        shot: "calendar/week",
        d: "Every account in one view, or switch to just one.",
      },
      {
        icon: LayoutGrid,
        t: "Day to year",
        shot: "calendar/month",
        d: "Day, Week, Month, Year and Schedule, with Today and quick paging.",
      },
      {
        icon: CalendarPlus,
        t: "Create and edit events",
        shot: "calendar/create",
        d: "Title, times, all day, guests, location, notes, and which calendar it lands on.",
      },
      {
        icon: MousePointerClick,
        t: "Click to create",
        shot: "calendar/create",
        d: "Click a time slot or an empty day to start an event right there.",
      },
      {
        icon: Move,
        t: "Drag to reschedule",
        shot: "calendar/week",
        d: "Drag an event to a new time or day, or drag its edge to change its length.",
      },
      {
        icon: Video,
        t: "Meeting links",
        shot: "calendar/details",
        d: "Add Google Meet or Teams with one switch, and join from the event.",
      },
      {
        icon: UserCheck,
        t: "Guests and RSVP",
        shot: "calendar/guests",
        d: "Invite people by email and answer invitations with Yes, No or Maybe.",
      },
      {
        icon: Repeat,
        t: "Repeating events",
        shot: "calendar/schedule",
        d: "Recurring meetings show on every date they happen, clearly marked.",
      },
      {
        icon: Globe,
        t: "Your time zone",
        d: "Everything shows in your local time, and all-day events stay on their day.",
      },
      {
        icon: Palette,
        t: "Colors you know",
        d: "Each calendar keeps the color it has at the provider.",
      },
      {
        icon: Eye,
        t: "Show and hide for yourself",
        shot: "calendar/hide",
        d: "Sidebar toggles change your view only, never a teammate's.",
      },
      {
        icon: Share2,
        t: "Choose per workspace",
        shot: "calendar/workspace",
        d: "Owners and admins pick which calendars each workspace can see and share.",
      },
      {
        icon: Command,
        t: "Keyboard shortcuts",
        shot: "calendar/shortcuts",
        d: "C then a letter to switch view, jump to today or create. J and K page through time.",
      },
      {
        icon: Bot,
        t: "Calendar agent",
        shot: "calendar/assistant",
        d: "Ask about your week, find free time, and create or move events once you approve.",
        tag: AI,
      },
    ],
  },
  drive: {
    kicker: "Drive",
    title: ["Every drive,", "one explorer."],
    lede: "Cloud drives and file servers next to your mail, with previews that open in the browser.",
    href: "/drive",
    features: [
      {
        icon: HardDrive,
        t: "Cloud drives and file servers",
        shot: "drive/sources",
        d: "Google Drive and OneDrive come with the account you connect. S3, WebDAV, FTP and SFTP servers are added by the instance owner.",
      },
      {
        icon: Layers,
        t: "All drives view",
        shot: "drive/all",
        d: "Browse every drive in the workspace from one place.",
      },
      {
        icon: LayoutGrid,
        t: "List or grid",
        shot: "drive/grid",
        d: "Breadcrumbs, back and forward, and long folders that load as you go.",
      },
      {
        icon: Upload,
        t: "Drag and drop upload",
        shot: "drive/list",
        d: "Upload several files at once with a progress bar.",
      },
      {
        icon: FolderPlus,
        t: "Everyday file actions",
        shot: "drive/file-menu",
        d: "New folders, rename, download, or open the file at its provider.",
      },
      {
        icon: Search,
        t: "Search",
        shot: "drive/search",
        d: "Find files by name. On Google Drive, search reads file contents too.",
      },
      {
        icon: Pin,
        t: "Pins and recents",
        shot: "drive/recent",
        d: "Pin folders to the sidebar and jump back to the last eight you opened.",
      },
      {
        icon: Gauge,
        t: "Storage meter",
        d: "Used and total space, wherever the provider reports it.",
      },
      {
        icon: FileSearch,
        t: "Preview in the browser",
        shot: "drive/preview",
        d: "Images, video, audio, PDF, Markdown, CSV tables, ZIP contents and text.",
      },
      {
        icon: FolderTree,
        t: "Folder limits per workspace",
        shot: "drive/restrictions",
        d: "Choose which top-level folders a workspace can see.",
      },
      {
        icon: Paperclip,
        t: "Save attachments to a drive",
        shot: "mail/attachments",
        d: "Send an email attachment straight into the folder you pick.",
      },
      {
        icon: Link2,
        t: "Drive links in email",
        d: "Insert a Google Drive or OneDrive link while you write.",
      },
      {
        icon: ArrowDownUp,
        t: "Straight to the provider",
        d: "Google Drive, OneDrive and S3 transfers go between your browser and the provider.",
      },
      {
        icon: Trash2,
        t: "Honest deletes",
        shot: "drive/delete",
        d: "Google Drive and OneDrive use their trash. Other sources delete for good, and the dialog says so.",
      },
      {
        icon: Keyboard,
        t: "Keyboard shortcuts",
        shot: "drive/shortcuts",
        d: "D then a letter for new folder, upload, search, view or preview.",
      },
      {
        icon: Bot,
        t: "Drive agent",
        shot: "drive/assistant",
        d: "Ask about files, read text files, and create, rename, move or delete once you approve.",
        tag: AI,
      },
    ],
  },
  contacts: {
    kicker: "Contacts",
    title: ["Every address book,", "one list."],
    lede: "Google, Outlook, Zoho and CardDAV contacts next to your mail, saved from any email in one click.",
    href: "/contacts",
    features: [
      {
        icon: Layers,
        t: "Google, Outlook, Zoho and CardDAV",
        shot: "contacts/sources",
        d: "Google, Outlook and Zoho contacts come with the account you connect. CardDAV servers are added by the instance owner.",
      },
      {
        icon: BookUser,
        t: "All contacts in one list",
        shot: "contacts/all",
        d: "Every address book in the workspace merged and sorted by name, or one book at a time.",
      },
      {
        icon: Filter,
        t: "Filter as you type",
        shot: "contacts/filter",
        d: "Narrow the list by name, email, phone, organization or job title.",
      },
      {
        icon: Tags,
        t: "Books and groups",
        shot: "contacts/sidebar",
        d: "Outlook folders and CardDAV address books show as books; Google groups and Zoho categories filter the list.",
      },
      {
        icon: IdCard,
        t: "The whole contact",
        shot: "contacts/card",
        d: "Emails, phones, addresses, organization, birthday, website and notes, with recent mail and upcoming events with them.",
      },
      {
        icon: PenLine,
        t: "Create, edit and delete",
        shot: "contacts/edit",
        d: "Changes are saved at the provider, so every app on that address book sees them.",
      },
      {
        icon: UserPlus,
        t: "Save from any email",
        shot: "mail/save-contact",
        d: "Add a sender or recipient to the address book you pick, or open them if they are already saved.",
      },
      {
        icon: Sparkles,
        t: "Save from a summary",
        shot: "contacts/summary",
        d: "A summary's contact card saves the person with their name, company, phone and address filled in.",
        tag: AI,
      },
      {
        icon: Send,
        t: "Suggestions that know them",
        d: "Saved contacts come first when you address mail or search for a person.",
      },
      {
        icon: Eye,
        t: "Choose what each workspace sees",
        shot: "contacts/visibility",
        d: "Pick which address books show in each workspace. A new one stays hidden until you switch it on.",
      },
      {
        icon: BookLock,
        t: "Read-only books respected",
        d: "A CardDAV address book your login can only read is marked, and nothing tries to write to it.",
      },
      {
        icon: Workflow,
        t: "In workflows and MCP",
        d: "Workflow steps and MCP clients list, search and save contacts too.",
      },
      {
        icon: Bot,
        t: "Contacts agent",
        shot: "contacts/assistant",
        d: "Ask about your contacts, and add, fix or delete them once you approve.",
        tag: AI,
      },
    ],
  },
} satisfies Record<string, Area>;

export const AREAS = { ...CORE_AREAS, ...MORE_AREAS } as Record<
  keyof typeof CORE_AREAS | keyof typeof MORE_AREAS,
  Area
>;
export type AreaKey = keyof typeof AREAS;
