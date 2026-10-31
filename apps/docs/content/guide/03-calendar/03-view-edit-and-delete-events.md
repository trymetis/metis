---
title: View, edit and delete events
description: Open an event to see its details, change it, delete it, or answer an invitation.
---

Click any event in the Day, Week, Month or Schedule view to open its details.

## See an event's details

<img src="/images/calendar/event-details.webp" alt="The details of an event, with its title, time, location and calendar" class="dark:hidden" />
<img src="/images/calendar/event-details-dark.webp" alt="The details of an event, with its title, time, location and calendar" class="hidden dark:block" />

The details show, from top to bottom:

- The event's color and its title. An event with no title shows "(no title)".
- The date, such as "Thursday, 8 October". For an event with a set time, the start and end times follow the date. An all-day event shows only the date.
- "Repeats", if the event is part of a repeating series.
- The online meeting, if the event has a meeting link. The link reads "Join with" and the name of the service, such as "Join with Google Meet", "Join with Zoom" or "Join with Microsoft Teams". If Metis Suite does not know the service, it reads "Join the meeting". The link opens the meeting in a new tab.
- **Copy meeting link**, the copy button right after the meeting link. Click it to copy the link. Its icon turns into a check mark for a moment.
- The meeting address under the link (the link without "https://"). Below it you may see "Meeting ID:" and "Passcode:" with their values, when the calendar provides them. The meeting ID is left out when it is already part of the link.
- Dial-in numbers (phone numbers you call to join the meeting by phone), when the calendar provides them. Up to four numbers appear. Click a number to call it. On most phones, the call also dials the PIN for you. Under each number you may see its label, its PIN ("PIN:" and the number), or both.
- The location.
- "Organized by" and the name of the person who organized the event. When there is no name, the email address shows instead.
- The number of guests and up to eight of their names. A check mark shows who has accepted.
- The description. A long description is cut short after 600 characters.
- The calendar the event belongs to.

Which of these details appear depends on your calendar. Google Calendar can show all of them. Outlook Calendar shows the name of the meeting service, the dial-in numbers with their PIN, and the organizer's name, but no meeting ID or passcode. Zoho Calendar shows the meeting link, the meeting ID and the organizer's email address, but no passcode or dial-in numbers. CalDAV calendars show the meeting link, dial-in numbers and organizer's name that the event includes. When the event has no meeting link of its own, Metis Suite looks in the event's web address, location and notes. It picks up a Google Meet, Zoom, Microsoft Teams, Whereby, Webex or Zoho Meeting link that starts with "https://".

The buttons at the top right are **Edit event** (pencil), **Delete event** (bin) and **Close** (X).

## Edit an event

1. Open the event.
2. Click **Edit event**. The **Edit event** dialog opens with the event's details filled in.

   <img src="/images/calendar/edit-event-dialog.webp" alt="The Edit event dialog with the event's details filled in" class="dark:hidden" />
   <img src="/images/calendar/edit-event-dialog-dark.webp" alt="The Edit event dialog with the event's details filled in" class="hidden dark:block" />

3. Change what you need. The fields are the same as when you [create an event](/guide/calendar/create-an-event), except that you cannot add a Google Meet or Teams meeting while editing.
4. Click **Save**.

To change only the time or day, you can also [drag the event](/guide/calendar/move-and-resize-events) in Day or Week view.

### Repeating events

An occurrence is one date of a repeating event. Each occurrence is its own item in Metis Suite, whatever your calendar provider.

- When you edit, move or delete one occurrence, only that occurrence changes.
- When you answer an invitation on one occurrence, your answer applies only to that occurrence. This is the same in Google Calendar, Outlook Calendar and CalDAV calendars.

Metis Suite has no option to change or delete every occurrence at once. To change the whole series, use your calendar provider's own app.

## Delete an event

1. Open the event.
2. Click **Delete event**.
3. Metis Suite asks "Delete &lt;event title&gt;?" It names the calendar the event is removed from and says "This can't be undone."

   <img src="/images/calendar/delete-event.webp" alt="The confirmation shown before an event is deleted" class="dark:hidden" />
   <img src="/images/calendar/delete-event-dark.webp" alt="The confirmation shown before an event is deleted" class="hidden dark:block" />

4. Click **Delete** to delete the event, or **Cancel** to keep it.

When the event is deleted, the calendar refreshes and the event's details close.

If the event cannot be deleted, it stays in your calendar and its details stay open. A message explains why, such as "Couldn't delete that event. Try again." If it says "This account needs to be reconnected.", reconnect the account and try again.

## Answer an invitation

When an event has guests and you did not organize it, the bottom of its details shows "Going?" with three buttons: **Yes**, **No** and **Maybe**. You do not see these buttons on events you organized. Metis Suite counts you as the organizer when the organizer's email address is your calendar account's address. On Zoho Calendar events, these buttons never appear. You answer a Zoho Calendar invitation in Zoho Calendar or from the invitation email.

1. Open the event.
2. Click **Yes**, **No** or **Maybe**. Your answer is highlighted.

What happens next depends on your provider:

- Google Calendar sends your answer to the other guests.
- Outlook Calendar sends your answer to the organizer.
- On a CalDAV calendar, Metis Suite changes your answer in your own copy of the event and sends no message itself. Some CalDAV servers pass your answer on to the organizer.

On Google Calendar and CalDAV calendars, you can answer only if your email address is on the event's guest list. If it is not, the message "You are not an attendee on this event" appears and your answer is not saved.

If your answer cannot be sent, a message appears, such as "Couldn't send your reply. Try again." If it says "This account needs to be reconnected.", reconnect the account and try again.
