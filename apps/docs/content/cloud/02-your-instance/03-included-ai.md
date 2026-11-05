---
title: Included AI
description: See how much of this month's included AI credit your instance has used, what happens when it runs out, and how to switch to your own provider and back.
---

Every Cloud instance includes AI each month, on both plans. Your instance comes with AI models that Metis Cloud provides, so you do not need an AI provider of your own. As on any instance, AI is off for each mailbox, calendar and drive until its owner turns it on. See [How AI works in Metis Suite](/guide/assistant/how-ai-works).

The included AI covers two models, and each has its own monthly credit:

- **The LLM** (large language model). It writes text: the assistant's answers, smart replies and summaries, for example.
- **The decision model.** It answers short questions about a message, such as which label fits. On a new Cloud instance, it labels incoming mail, decides whether a thread needs a summary, and runs the **Ask** and **Branch** steps of workflows.

## See how much is used

The **Included AI** card shows how much of this month's credit each model has used. You find it in two places:

- the instance's [**Overview**](https://console.trymetis.email/instances/~) tab, while the instance is running;
- the instance's [**Billing**](https://console.trymetis.email/instances/~/billing) tab.

The card has two charts, **AI** for the LLM and **Decision model**. Each shows the share of the credit used, such as "37%", or "<1%" for very little.

The card's text gives the reset date: "How much of this month's credit is used. It resets on November 30, 2026, with nothing carried over." Before your instance has used any AI this month, it says "Nothing is used yet."

## How the credit works

- **It resets each month,** on the date the card shows. This is also true on a yearly plan.
- **Nothing is carried over** to the next month, and you cannot buy more.
- **The two credits are separate.** Using up one does not stop the other model.
- **Each included model uses the same credit, some much faster than others.** The [**Billing**](https://console.trymetis.email/instances/~/billing) tab lists the included models you can choose from, with a short note on what each suits.

## When a credit is used up

The chart shows "100%", and the card says "A used-up credit stops that model until it resets. You can switch it to your own provider in the instance's dashboard meanwhile."

Inside your instance, the AI features that use that model stop with a general error until the reset date:

- The assistant's chat shows an error with a **Retry** button.
- Smart replies and summaries do not appear.
- New mail stays unlabelled.
- AI steps in workflows fail, including **Ask** and **Branch**.

Everything works again after the reset date, or as soon as you switch that model to your own provider.

## Use your own provider

You can switch the LLM, the decision model, or both, to your own provider at any time. That traffic does not use the included credit.

1. Open your instance and click your initials at the bottom of the left rail. Choose **Dashboard**.
2. Open **System**, then **LLM** under **Drivers**. The **Decision model** card is on the same page.
3. Change the driver and its fields to your own provider's values. [AI models](/self-hosting/configure/ai-models) explains every field.
4. Click **Save changes** and enter your authenticator code.

## Go back to the included models

The [**Billing**](https://console.trymetis.email/instances/~/billing) tab of your instance in the console has a card called **Using your own provider**. It lists the values the included models need, under **LLM** and **Decision model**. Each value except **Driver** has a copy button. Set **Driver**, copy the other values into the dashboard's **LLM** page, then click **Save changes** and enter your authenticator code.

Some names in the console differ from the names in the dashboard:

| In the console                 | In the dashboard                             |
| ------------------------------ | -------------------------------------------- |
| **Driver** "OpenAI-compatible" | **Driver** `openai-compatible`               |
| **Driver** "SystemOne"         | **Driver** `systemone` (Decision model card) |
| **Chat model**                 | **Chat and agents model**                    |
| **Smart reply model**          | **Smart replies model**                      |
| **Summary model**              | **Summaries model**                          |
| **Classifier model**           | **Classifier model**                         |

Copy the **API key** too. The included models do not work without it.

The values appear once your instance has reported its first AI use. Until then, the card says "The included models appear here once the instance reports its first usage."

Below the values is the list of included models. "Any of these included models can go in a model field. Each one uses the same credit, some much faster than others." Copy a model name from the list to use it in one of the model fields.
