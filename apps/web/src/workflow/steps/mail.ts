import { MAIL_FOLDERS } from "@/types/mail";

import { T } from "../values";
import { ITEM, line, literal, literalString, p, shown, step, template } from "./define";
import type { CardContext, StepDef } from "./types";

const message = p.expr("Message", T.mail, { default: ITEM, required: true });

function mailboxLine(ctx: CardContext, mailboxId: string) {
  if (!mailboxId) return line("Pick a mailbox", "warn");
  return line(ctx.mailboxEmail(mailboxId) ?? "A mailbox you can't see");
}

const FOLDER_OPTIONS = MAIL_FOLDERS.map((folder) => ({
  value: folder,
  label: folder[0]?.toUpperCase() + folder.slice(1),
}));

const get = step({
  key: "mail.get",
  label: "Get a message",
  category: "mail",
  description: "Loads one message, with its body and attachments.",
  params: {
    mailbox: p.mailbox("Mailbox", { required: true }),
    id: p.text("Message id", { required: true }),
  },
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [mailboxLine(ctx, literalString(node, "mailbox")), shown(node, "id", "Id")],
});

const list = step({
  key: "mail.list",
  label: "List a folder",
  category: "mail",
  description: "Passes on the newest messages in a folder, one item each.",
  params: {
    mailbox: p.mailbox("Mailbox", { required: true }),
    folder: p.mailFolder("Folder", { options: FOLDER_OPTIONS }),
    limit: p.number("At most", { bindable: false, default: literal(25), min: 1, max: 100 }),
  },
  many: true,
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox")),
    line(`Newest in ${literalString(node, "folder") || "inbox"}`, "muted"),
  ],
});

const search = step({
  key: "mail.search",
  label: "Search mail",
  category: "mail",
  description: "Passes on the messages a search finds, one item each.",
  params: {
    mailbox: p.mailbox("Mailbox", { required: true }),
    query: p.text("Search", { required: true, placeholder: "from:billing@example.com" }),
    limit: p.number("At most", { bindable: false, default: literal(25), min: 1, max: 100 }),
  },
  many: true,
  output: () => T.mail,
  effect: "read",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox")),
    shown(node, "query", "For"),
  ],
});

const thread = step({
  key: "mail.thread",
  label: "Get the thread",
  category: "mail",
  description: "Loads every message in a message's conversation.",
  params: { message },
  output: () => T.thread,
  effect: "read",
  card: (node) => [shown(node, "message", "Of")],
});

function messageAction<const K extends string>(
  key: K,
  label: string,
  description: string,
  extra: StepDef["params"] = {},
  card?: StepDef["card"],
): StepDef & { key: K } {
  return step({
    key,
    label,
    category: "mail",
    description,
    params: { message, ...extra },
    output: () => T.mail,
    effect: "write",
    card:
      card ??
      ((node) => [
        node.params.message?.kind === "expr" &&
          node.params.message.cel !== "item" &&
          shown(node, "message", "On"),
      ]),
  });
}

const markRead = messageAction(
  "mail.markRead",
  "Mark as read",
  "Marks a message read or unread.",
  { read: p.boolean("Read", { default: literal(true) }) },
  (node) => [
    line(
      node.params.read?.kind === "literal" && node.params.read.value === false
        ? "Mark unread"
        : "Mark read",
    ),
  ],
);

const star = messageAction(
  "mail.star",
  "Star",
  "Stars or unstars a message.",
  { starred: p.boolean("Starred", { default: literal(true) }) },
  (node) => [
    line(
      node.params.starred?.kind === "literal" && node.params.starred.value === false
        ? "Remove the star"
        : "Add a star",
    ),
  ],
);

const label = messageAction(
  "mail.label",
  "Label",
  "Puts a label on a message, or takes one off.",
  {
    label: p.label("Label", { required: true, bindable: true }),
    action: p.select(
      "Action",
      [
        { value: "add", label: "Add" },
        { value: "remove", label: "Remove" },
      ],
      { default: literal("add") },
    ),
  },
  (node, ctx) => {
    const key = literalString(node, "label");
    const verb = literalString(node, "action") === "remove" ? "Remove" : "Add";
    return [
      key
        ? line(`${verb} ${ctx.labelName(key)}`)
        : (shown(node, "label", verb) ?? line("Pick a label", "warn")),
    ];
  },
);

const mute = messageAction(
  "mail.mute",
  "Mute the thread",
  "Mutes the message's conversation for the workflow's owner.",
);
const archive = messageAction("mail.archive", "Archive", "Moves a message out of the inbox.");
const trash = messageAction("mail.trash", "Move to trash", "Moves a message to the trash.");

const toInbox = messageAction(
  "mail.toInbox",
  "Move to Inbox",
  "Moves a message back to the inbox, from the archive, the trash or spam.",
);

const recipients = {
  to: p.emails("To", { required: true, target: true }),
  cc: p.emails("Cc", { target: true }),
  bcc: p.emails("Bcc", { target: true }),
};

const content = {
  subject: p.text("Subject"),
  body: p.longtext("Message", { required: true }),
  attachments: p.expr("Attachments", T.list(T.blob), {
    help: "A list of file contents, for example from Download a file.",
  }),
};

const signature = {
  signature: p.boolean("Add signature", {
    default: literal(true),
    help: "Adds the default signature of the person the workflow runs as.",
  }),
};

const draft = step({
  key: "mail.draft",
  label: "Create a draft",
  category: "mail",
  description: "Saves a draft in a mailbox without sending it.",
  params: {
    mailbox: p.mailbox("From", { required: true }),
    ...recipients,
    ...content,
    ...signature,
  },
  output: () => T.draft,
  effect: "write",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox")),
    shown(node, "to", "To"),
    shown(node, "subject", "Subject"),
  ],
});

const send = step({
  key: "mail.send",
  label: "Send mail",
  category: "mail",
  description:
    "Sends a new message. A send is never repeated; an unclear outcome waits for a person.",
  params: {
    mailbox: p.mailbox("From", { required: true }),
    ...recipients,
    ...content,
    ...signature,
  },
  output: () => T.mail,
  effect: "dispatch",
  card: (node, ctx) => [
    mailboxLine(ctx, literalString(node, "mailbox")),
    shown(node, "to", "To"),
    shown(node, "subject", "Subject"),
  ],
});

const reply = step({
  key: "mail.reply",
  label: "Reply",
  category: "mail",
  description: "Replies to a message from the mailbox it arrived in.",
  params: {
    message,
    body: p.longtext("Reply", { required: true }),
    replyAll: p.boolean("Reply to everyone", { default: literal(false) }),
    ...signature,
  },
  output: () => T.mail,
  effect: "dispatch",
  card: (node) => [shown(node, "body", "Says")],
});

const forward = step({
  key: "mail.forward",
  label: "Forward",
  category: "mail",
  description: "Forwards a message, with its attachments, from the mailbox it arrived in.",
  params: {
    message,
    to: p.emails("To", { required: true, target: true }),
    note: p.longtext("Note", { default: template("") }),
    ...signature,
  },
  output: () => T.mail,
  effect: "dispatch",
  card: (node) => [shown(node, "to", "To")],
});

const addBcc = step({
  key: "mail.addBcc",
  label: "Add a Bcc",
  category: "mail",
  description: "Adds an address to an outgoing message's Bcc, unless it is already a recipient.",
  params: { address: p.text("Address", { required: true, target: true }) },
  output: () => T.draft,
  beforeSend: true,
  effect: "read",
  check: ({ input }) =>
    input && input.kind !== "draft" ? ["Connect this step to an outgoing message"] : [],
  card: (node) => [shown(node, "address", "Bcc")],
});

const sendScheduled = step({
  key: "mail.sendScheduled",
  label: "Send the scheduled message",
  category: "mail",
  description: "Sends the message a person scheduled.",
  scope: "builtin",
  params: { mailbox: p.mailbox("From", { required: true }) },
  output: () => T.mail,
  effect: "dispatch",
  card: (node, ctx) => [mailboxLine(ctx, literalString(node, "mailbox"))],
});

const saveAttachment = step({
  key: "mail.saveAttachment",
  label: "Save attachment to a drive",
  category: "drive",
  description: "Copies a mail attachment into a drive folder.",
  params: {
    attachment: p.expr("Attachment", T.attachment, { default: ITEM, required: true }),
    drive: p.drive("Drive", { required: true }),
    folder: p.driveFolder("Folder", { target: true }),
    name: p.text("File name", { help: "Leave empty to keep the attachment's name." }),
  },
  output: () => T.file,
  effect: "dispatch",
  card: (node, ctx) => [
    line(
      ctx.driveName(literalString(node, "drive")) ?? "Pick a drive",
      literalString(node, "drive") ? undefined : "warn",
    ),
    shown(node, "folder", "Into"),
  ],
});

const saveEml = step({
  key: "mail.saveEml",
  label: "Save message to a drive",
  category: "drive",
  description: "Saves a message as an .eml file in a drive folder.",
  params: {
    message,
    drive: p.drive("Drive", { required: true }),
    folder: p.driveFolder("Folder", { target: true }),
    name: p.text("File name", { help: "Leave empty to name it after the subject." }),
  },
  output: () => T.file,
  effect: "dispatch",
  card: (node, ctx) => [
    line(
      ctx.driveName(literalString(node, "drive")) ?? "Pick a drive",
      literalString(node, "drive") ? undefined : "warn",
    ),
    shown(node, "folder", "Into"),
  ],
});

export const MAIL_STEPS = [
  get,
  list,
  search,
  thread,
  markRead,
  star,
  label,
  mute,
  archive,
  trash,
  toInbox,
  draft,
  send,
  reply,
  forward,
  addBcc,
  sendScheduled,
  saveAttachment,
  saveEml,
] as const satisfies readonly StepDef[];
