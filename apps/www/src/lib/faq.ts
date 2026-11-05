import type { Route } from "next";

export type FaqItem = {
  question: string;
  answer: string;
  link?: { href: Route; label: string };
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Metis Suite?",
    answer:
      "An open-source suite that joins the accounts you already have: mail, calendars and drives from Google, Microsoft, Zoho and your own IMAP, CalDAV and file servers, with an AI agent, workflows and MCP that work across all of them. It does not host your mail: that stays with your provider.",
  },
  {
    question: "Does Metis store a copy of my mailbox?",
    answer:
      "It never mirrors your mailbox. It caches the messages you open, plus the summaries and labels it makes, so they load instantly next time. Access tokens and server logins are encrypted before they reach the database.",
  },
  {
    question: "Which AI model does it use?",
    answer:
      "On Metis Cloud, every plan includes AI credits each billing month, for the AI model and the decision model, so AI works from the first day. A credit that runs out stops until the next billing day, with no top-ups, and the instance owner can switch to their own key at any time. Self-hosted instances bring their own: a key for OpenAI, Anthropic or any OpenAI-compatible endpoint, which can be a model on your own hardware. AI stays off for every mailbox, calendar and drive until you turn it on, and turning it on asks for your two-factor code.",
  },
  {
    question: "Can the agent send mail or delete things on its own?",
    answer:
      "No. Sending, deleting, unsubscribing and every calendar, drive and workflow write wait for your approval in the chat. Reversible personal actions such as labels, snooze and read later run directly, the same way an archive does.",
  },
  {
    question: "What license is Metis under?",
    answer:
      "AGPL-3.0-or-later. You can read every line, run it on your own servers, fork it and contribute. If your organization cannot meet the AGPL's terms, a commercial license is available.",
  },
  {
    question: "What is the difference between Metis Cloud and self-hosting?",
    answer:
      "Both run the same release. On Metis Cloud we run an isolated instance for you, on your domain or a metis-suite.app subdomain. Self-hosting runs it on a Linux server you own with Docker Compose, free under AGPL-3.0.",
  },
  {
    question: "Is there a desktop or mobile app?",
    answer:
      "Yes: a desktop app for macOS, Windows and Linux, and an Android app, free to download. Every app works with any Metis Suite server: you enter its address the first time you open it. There is no iPhone app; the web app works in the iPhone's browser.",
    link: { href: "/apps#downloads", label: "Download the apps" },
  },
];
