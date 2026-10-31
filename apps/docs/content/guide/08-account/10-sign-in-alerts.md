---
title: Sign-in alerts
description: Get an email each time someone signs in to your account, read what the alert tells you, and turn the alerts off or on.
---

A sign-in alert is an email that Metis Suite sends you each time someone signs in to your account. It tells you when the sign-in happened, which device was used and the IP address it came from. If you did not sign in yourself, the alert lets you act quickly.

Sign-in alerts are on for every account from the start. They go to your account's email address, the one you sign in with. You cannot send them to a different address.

## When you get an alert

You get one alert for each sign-in. This includes sign-ins from a device you have used before. The first sign-in after you create your account sends one too.

The alert is sent when the sign-in is complete:

- If Metis Suite asks for your two-factor code, the alert is sent after it accepts the code.
- If you ticked **Trust this device for 30 days** and Metis Suite skips the code, the alert is sent right after your password or magic link.
- Signing in to the [desktop app](/guide/apps/desktop-app) or the [mobile app](/guide/apps/mobile-app) sends its own alert.

You get no alert when you enter a code while you are already signed in. For example, setting up two-factor authentication or confirming a password change sends no alert.

If the alert email cannot be sent, you can still sign in.

## What the alert shows

The email has the subject "New sign-in to your Metis Suite account". It says "Someone just signed in to your Metis Suite account. If this was you, there's nothing to do." Then it lists these details:

| Detail             | What it shows                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Account**        | Your account's email address.                                                                                                       |
| **When**           | The date and time of the sign-in, in UTC (Coordinated Universal Time). It can differ from your local time.                          |
| **Device**         | The browser, its version and the system, for example "Chrome 130 on Windows". If Metis Suite cannot tell, it says "Unknown device". |
| **IP address**     | The network address the sign-in came from. If Metis Suite does not know it, it says "Unknown".                                      |
| **Signed in with** | How the sign-in was completed. See the next table.                                                                                  |

| Signed in with                                      | Meaning                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authenticator code**                              | The last step was a code from an authenticator app.                                                                                           |
| **Backup code**                                     | The last step was a backup code.                                                                                                              |
| **Password**                                        | The sign-in used a password and no code was asked for. This happens when two-factor authentication is not set up yet, or on a trusted device. |
| **Email sign-in link**                              | The sign-in used a magic link and no code was asked for, for example on a trusted device.                                                     |
| **Desktop or mobile app, from a signed-in browser** | The desktop app or the mobile app was signed in from a browser that was already signed in.                                                    |

When a sign-in has a code step, the alert names the kind of code, not the password or magic link that came before it.

The email has a **Review your sessions** button. It opens your **Account** settings page, where you can see every browser that is signed in. If the button does not work, the email also has the link as text that you can paste into your browser.

## If the sign-in was not you

Act quickly:

1. Click **Review your sessions** in the alert. Under **Where you're signed in**, sign out any browser you do not recognize. See [Manage signed-in devices](/guide/account/signed-in-devices).
2. Change your password under **Settings**, **Security**. This signs out every other browser. See [Change or reset your password](/guide/account/change-or-reset-your-password).
3. Check your [Security activity](/guide/account/security-activity) for changes you did not make.

## Turn sign-in alerts off or on

1. Open your user menu and click **Settings**.
2. Click **Security**.
3. Find the **Sign-in alerts** card. It is below **Change password** and above **Disable two-factor authentication**.
4. Click the switch to turn alerts off or on.

<img src="/images/account/sign-in-alerts.webp" alt="The Sign-in alerts card with its switch turned on" class="dark:hidden" />
<img src="/images/account/sign-in-alerts-dark.webp" alt="The Sign-in alerts card with its switch turned on" class="hidden dark:block" />

The card shows your email address and says that alerts go there "each time someone signs in to this account, with the device, IP address and time, so a sign-in you didn’t make doesn’t go unnoticed." The switch is on the right side of the card.

Your choice is saved right away. There is no **Save** button, and you do not need a code. If the change cannot be saved, the switch goes back to how it was. A message tells you what went wrong, or says "Could not save". If you change your settings many times in a short time, you see "Too many requests. Please slow down." Wait a minute and try again.

The setting is for your whole account. It is the same in every workspace.

Turning sign-in alerts off is recorded as **Sign-in alerts turned off** in your [Security activity](/guide/account/security-activity). Turning them back on is not recorded.

## If you never get alerts

- Make sure the switch in the **Sign-in alerts** card is on.
- Look in your spam or junk folder.
- Ask the person who runs your Metis Suite server whether it sends email. If it does not, no alerts arrive, even when the switch is on.
