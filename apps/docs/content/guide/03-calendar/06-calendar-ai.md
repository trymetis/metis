---
title: Calendar AI
description: Open the AI assistant beside your calendar and ask it about your events.
---

**Calendar AI** is a chat panel that opens beside your calendar. You can ask it about your events, for example when you are free, and ask it to make changes for you. Before it changes anything, it asks for your approval.

This page shows how to open the panel. To learn how to talk to the assistant and approve its changes, see [AI assistant](/guide/assistant).

## Open Calendar AI

Click the **Calendar AI** button (the robot icon) in the calendar header, or press <kbd>c</kbd>, then <kbd>a</kbd>. Do the same again, or click **Close assistant**, to close it.

<img src="/images/calendar/calendar-ai.webp" alt="The calendar with the Calendar AI panel open on the right" class="dark:hidden" />
<img src="/images/calendar/calendar-ai-dark.webp" alt="The calendar with the Calendar AI panel open on the right" class="hidden dark:block" />

The panel's header tells you which calendars the assistant works with. It shows the calendar account's [name](/guide/calendar/views-and-navigation#how-calendar-accounts-are-named), such as "Google Calendar · you@example.com", or "All calendars" on the all-calendars view. It matches what you picked in the **Switch calendar** menu.

You see the **Calendar AI** button only when AI is set up on your Metis Suite instance and turned on for the workspace and for this calendar. On the all-calendars view, at least one of the calendars needs AI on. See [When the assistant is turned off](#when-the-assistant-is-turned-off).

## Ask a question

1. Type your question in the box that says "Ask about your calendar…".
2. Press <kbd>Enter</kbd> to send.

You can also click one of the suggestions, such as "What's on this week?" or "When am I free tomorrow?". It is sent right away.

The event you have selected is attached on its own. To keep it attached when you select another event, point at its chip and click the pin icon (**Keep attached while you browse**).

To point the assistant at one event, click **Attach an event** and pick it from the events in view. You can also drag an event onto the panel in Day or Week view. Events in the **All day** row cannot be dragged. As soon as you start dragging, a small card with the event's title and start time follows the pointer, and the event fades in the calendar. A box that says "Drop to attach" shows above the message box. It is highlighted while you are over the panel. If you let go over the calendar instead, the event moves there as usual. See [Attach items](/guide/assistant/use-the-side-panels#attach-items).

To start a new conversation, click **Clear chat** (the eraser icon) in the panel's header. It shows once you have sent a message. There is no confirmation, and the cleared chat cannot be brought back.

If something goes wrong, the panel shows "Calendar AI hit a problem" with a **Retry** button.

Calendar AI shares a limit of 20 messages a minute with the Mail AI, Drive AI and Contacts AI panels. See [Limits and troubleshooting](/guide/assistant/limits-and-troubleshooting).

## When the assistant is turned off

If AI is off for the workspace or for this calendar, the **Calendar AI** button does not show and <kbd>c</kbd> then <kbd>a</kbd> does nothing. The shortcut is also missing from the **Keyboard shortcuts** help.

An owner or admin of the workspace decides whether AI is allowed there. The person who connected the calendar turns AI on for it in this workspace. To learn how, see [How AI works in Metis Suite](/guide/assistant/how-ai-works) and [Workspaces](/guide/workspaces).
