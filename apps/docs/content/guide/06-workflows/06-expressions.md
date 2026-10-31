---
title: Expressions
description: Use values from earlier steps in a workflow, write conditions, fill text with values, and declare the fields a workflow takes in.
---

An **expression** is a short formula that works out a value while the workflow runs. For example, `item.from` is the sender of the current message, and `item.subject.contains("invoice")` is true when its subject contains "invoice". You use expressions in conditions, and in any setting that should change from run to run.

Workflows use a standard expression language called CEL (Common Expression Language). This page covers what you need for workflows.

## Fixed value or expression

Many settings can hold either a fixed value or an expression. Click the toggle next to the setting to switch between them. It says **Use an expression** or **Use a fixed value**.

- **Conditions are always expressions.** This includes **Condition** on **If**, **Keep when** on **Filter**, the cases of **Switch**, and **Only when** on triggers. For **Condition**, **Keep when** and **Only when**, you can also build the expression from rows instead of typing it. See [Build a condition from rows](#build-a-condition-from-rows).
- **Text settings can hold values.** Put an expression between double curly brackets, for example `Re: {{ trigger.subject }}`. The text becomes a **template**: each `{{ }}` part is replaced by its value when the step runs.

## Insert a value from an earlier step

Click the **{ }** button next to a setting ("Insert a value from an earlier step") to pick a value instead of typing it. Type in **Search values** to filter the list. It is grouped into:

- **This item**: the fields of the item that reached this step.
- **Trigger**: the fields of what started the run.
- One group for each earlier step, by its name.
- **Run**: the current time (`now`), the workflow's name (`run.workflow`), when the run started (`run.startedAt`) and the run's id (`run.id`).

## The editor checks as you type

Below an expression, the Inspector says what kind of value it gives, for example "Gives yes / no" or "Gives text". If the value is the wrong kind for the setting, it says so, for example "This gives text, but yes / no is needed". An empty expression shows "Write an expression". A fixed value of the wrong kind shows "Expected" and the kind, for example "Expected number".

The workflow cannot be saved until every expression is correct.

## What an expression can read

| Name              | What it is                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `item`            | The item that reached this step, such as a message, an event or a file.                                                                          |
| `trigger`         | What started the run, such as the new message or the webhook's body. See [Triggers](/guide/workflows/triggers) for what each trigger passes on.  |
| `steps.<step id>` | The result of an earlier step, by the step's id, for example `steps.s1a2b3c4d.summary`. Only steps that come before this one on every path work. |
| `run`             | The run: `run.id`, `run.workflow` and `run.startedAt`.                                                                                           |
| `now`             | The current date and time.                                                                                                                       |

The step id shows in the Inspector when you select a step. See [Use the editor](/guide/workflows/use-the-editor#settings-every-step-has).

## Write a condition

A condition is an expression that is either true or false. Some examples:

| Condition                                       | True when                                               |
| ----------------------------------------------- | ------------------------------------------------------- |
| `item.from.endsWith("@example.com")`            | The sender's address ends with `@example.com`.          |
| `item.subject.lowerAscii().contains("invoice")` | The subject contains "invoice", in any mix of capitals. |
| `item.hasAttachments`                           | The message has attachments.                            |
| `domain(item.from) == "example.com"`            | The sender's domain is `example.com`.                   |
| `item.to.exists(a, a.endsWith("@example.com"))` | Any recipient's address ends with `@example.com`.       |
| `item.name.lowerAscii().endsWith(".pdf")`       | A file or attachment name ends with `.pdf`.             |
| `item.start < now + duration("24h")`            | An event starts in the next 24 hours.                   |
| `!item.isRead && item.isStarred`                | The message is unread and starred.                      |

Use `&&` for "and", `||` for "or" and `!` for "not". Put text in double quotes. Use `==` to compare two values.

## Build a condition from rows

**Condition** on **If**, **Keep when** on **Filter** and **Only when** on triggers can be built from rows, so you do not have to write the expression yourself. The cases of **Switch** are always written as expressions.

A new, empty condition opens as rows. A condition you wrote opens as rows too, if it can be shown that way. If it cannot, it opens as text with the note "This expression can't be shown as conditions; edit it as text."

The rows sit in a box that starts with **Match**, a choice of **all** or **any**, and "of these":

- **all**: the condition is true when every row is true.
- **any**: the condition is true when at least one row is true.

Each row has three parts:

1. **Field**: the value to check. The list offers the fields of the item, of the trigger and of earlier steps, when they are text, a number, yes / no, a date or a list of text.
2. **Comparison**: how to check it. The choices depend on the kind of field (see the table below).
3. **Value**: what to compare with. **is empty**, **is not empty**, **is yes** and **is no** need no value.

To change the rows:

- Click **+ Condition** to add a row.
- Click **Group** to add a group: a box of its own, with its own **Match** choice. A new group starts with **any**, so you can write "this, or that" inside an "all". Groups can go two levels deep below the top.
- Click **Remove condition** (the **X** on a row) or **Remove group** (the **X** on a group) to remove it. If you remove every row, the condition is empty. On **Only when**, an empty condition means the trigger runs on every event.
- Click **Edit as expression** to see and change the condition as text. Click **Edit as conditions** to go back to rows, when the text can be shown that way.

| Kind of field | Comparisons                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Text          | **contains**, **does not contain**, **is**, **is not**, **starts with**, **ends with**, **matches pattern**, **is empty**, **is not empty** |
| Number        | **=**, **≠**, **>**, **≥**, **<**, **≤**                                                                                                    |
| Yes / no      | **is yes**, **is no**                                                                                                                       |
| Date          | **is before**, **is after**                                                                                                                 |
| List of text  | **includes**, **does not include**, **is empty**, **is not empty**                                                                          |

Good to know:

- **Text comparisons ignore capitals.** "Invoice" and "invoice" count as the same. This applies to every text comparison except **matches pattern**.
- **matches pattern takes a pattern.** Its **Value** is a pattern (a regular expression), not plain text. It is true when the pattern matches anywhere in the text. Use `^` to match the start and `$` to match the end, for example `^Invoice` for a subject that starts with "Invoice". It is case sensitive. A pattern that is not valid, such as `(`, shows "Not a valid pattern." in the row, under **Value**.
- **includes matches a whole entry.** On a list such as `to`, **includes** `ada@example.com` is true only when one entry is exactly that address.
- **A number that is not valid counts as 0.**
- **Dates use your browser's time zone.** The date and time you pick under **Value** is read in the time zone of the browser you pick it in.
- **The current time and run details are not offered.** To compare with `now` or a `run` field, use **Edit as expression**.

## Functions you can use

Besides the standard CEL functions, such as `contains()`, `startsWith()`, `endsWith()`, `lowerAscii()`, `size()` and `duration("24h")`, workflows add these:

| Function            | Gives                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `date(time)`        | The date in the workflow's time zone, as `YYYY-MM-DD`. For example `date(now)`.        |
| `date(time, zone)`  | The date in a time zone, as `YYYY-MM-DD`. For example `date(now, "Europe/Berlin")`.    |
| `time(time)`        | The time of day in the workflow's time zone, as `HH:MM`.                               |
| `time(time, zone)`  | The time of day in a time zone, as `HH:MM`.                                            |
| `string(time)`      | A date and time as text.                                                               |
| `domain(address)`   | The domain of an email address, in lower case.                                         |
| `lower(text)`       | The text in lower case.                                                                |
| `upper(text)`       | The text in upper case.                                                                |
| `joined(list, sep)` | The entries of a list of text, joined with `sep`. For example `joined(item.to, ", ")`. |

### The workflow's time zone

When you pass a time zone to `date()` or `time()`, they use that zone. Without one, they use the workflow's time zone:

1. The **Time zone** in the workflow's settings, when it is set. See [Manage workflows](/guide/workflows/manage-workflows#change-the-workflow-settings).
2. Otherwise, the **Time zone** of the **On a schedule** trigger that started the run.
3. Otherwise, UTC.

The same time zone applies to **Create an event**, to **Find free time** when its own **Time zone** is empty (a new step starts with your browser's time zone), to the **Agent** step, and to the **Only when** conditions of triggers.

## Fields of each kind of item

| Kind                             | Fields                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mail**                         | `id`, `mailboxId`, `mailbox`, `threadId`, `from`, `fromName`, `to`, `cc`, `subject`, `snippet`, `body`, `date`, `isRead`, `isStarred`, `labels`, `folder`, `hasAttachments`, `attachments` |
| **Attachment**                   | `id`, `mailboxId`, `messageId`, `name`, `mimeType`, `size`                                                                                                                                 |
| **Thread**                       | `id`, `mailboxId`, `subject`, `count`, `participants`, `lastDate`, `messages`                                                                                                              |
| **Draft** (a message being sent) | `id`, `mailboxId`, `to`, `cc`, `bcc`, `subject`, `body`, `html`, `replyToMessageId`, `attachments`                                                                                         |
| **Event**                        | `id`, `accountId`, `calendarId`, `calendar`, `title`, `description`, `location`, `start`, `end`, `allDay`, `status`, `organizer`, `attendees`, `myResponse`, `meetingUrl`, `recurring`     |
| **Attendee**                     | `email`, `name`, `response`                                                                                                                                                                |
| **File**                         | `id`, `driveId`, `name`, `kind`, `mimeType`, `size`, `modifiedAt`, `parentId`, `url`                                                                                                       |
| **Folder**                       | `id`, `driveId`, `name`, `url`                                                                                                                                                             |
| **Person**                       | `email`, `name`                                                                                                                                                                            |
| **File contents**                | `id`, `name`, `mimeType`, `size`                                                                                                                                                           |
| **Answer**                       | `value`, `label`, `probability`, `score`, `model`                                                                                                                                          |

`to`, `cc`, `labels`, `attachments` and `attendees` are lists. Use `exists()` to test whether any entry matches, or `size()` to count them.

## Declared fields

Some settings let you declare named fields: **Inputs** on **Run by hand** and **When called**, **Body fields** on **Webhook**, and **Fields** on the AI steps that give back fields. Each field has:

- A name: it starts with a letter or `_`, followed by letters, digits or `_`, up to 40 characters in all.
- A **Type**: **Text**, **Number**, **Yes / no**, **Date**, **Mail**, **Thread**, **Event**, **File**, **Folder**, **Person**, **Attachment**, **File contents**, **Any value**, **List of text**, **List of mail**, **List of events** or **List of files**. AI steps offer only **Text**, **Number**, **Yes / no**, **Date** and **List of text**.
- A description (optional), up to 300 characters.
- **Required**: tick it when the field must have a value.

You can declare up to 30 fields. Two fields cannot share a name.

## Size limits

- An expression can be up to 2,000 characters.
- A text setting with `{{ }}` values can be up to 20,000 characters.
