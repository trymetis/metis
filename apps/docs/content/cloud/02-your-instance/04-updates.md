---
title: Updates
description: Pick the hour Metis Cloud updates your instance, or turn automatic updates off, read the emails it sends, and update or undo yourself.
---

Metis Cloud updates your instance to new Metis Suite releases for you. You pick the hour it updates, or you turn automatic updates off. You can still upgrade and undo yourself from your instance's owner dashboard.

## What Metis Cloud does

Metis Cloud updates your instance to each new Metis Suite release, in the hour you pick. Automatic updates are on for every new instance, and the hour starts at **03:00 UTC**. UTC is Coordinated Universal Time, the same clock everywhere in the world.

An update starts within that hour. While it runs, your instance is offline for a minute or two. You get an email afterwards, whether or not the update finished.

## Change the hour or turn updates off

1. Open your instance in the console.
2. Click [**Settings**](https://console.trymetis.email/instances/~/settings) in the sidebar. The **Automatic updates** card is at the top.
3. To turn automatic updates off, clear **Update this instance automatically**. To turn them on again, select it.
4. To change the hour, pick a time in **Update hour**. The list runs from **00:00 UTC** to **23:00 UTC**. You can change the hour only while automatic updates are on.
5. Click **Save**. The button works only after you change something.

You see "Update settings saved." If you see "The update settings could not be saved. Try again in a few minutes.", nothing changed. Try again later.

Under **Update hour**, the card also shows that hour in your own time, such as "That is 05:00 GMT+2 where you are."

When automatic updates are off, Metis Cloud does not install new releases on your instance. You upgrade yourself, as described below.

## The emails

After each automatic update, Metis Cloud emails the owner email of the instance: the email of your Metis Cloud account. An upgrade you start yourself from the dashboard sends no email.

When the update finished, the subject is "acme.metis-suite.app was updated to Metis Suite 0.2.4", with your instance's address and the new version. The email says "Metis Cloud updated acme.metis-suite.app from 0.2.3 to Metis Suite 0.2.4 in its update window. If something does not work as before, you can undo the update from the Updates page of your instance's owner dashboard."

When the update did not finish, the subject is "The update of acme.metis-suite.app to 0.2.4 did not finish". See [If an update does not finish](#if-an-update-does-not-finish).

Both emails have the button **Open the update settings**, which opens the instance's [**Settings**](https://console.trymetis.email/instances/~/settings) tab in the console, where the **Automatic updates** card is. At the bottom, they say "You are getting this because automatic updates are on for this instance. Turn them off, or change the hour they run, on the instance's Settings tab in Metis Cloud."

## If an update does not finish

The email says "Metis Cloud tried to update acme.metis-suite.app from 0.2.3 to Metis Suite 0.2.4, and the update did not finish. We have been told and are looking at it; you do not need to do anything."

The console's [**Overview**](https://console.trymetis.email/instances/~) also shows the banner **The last upgrade did not finish**: "We have been told and are looking at it. Steps on your instance's Updates page that mention the server, the stack or the updater service are for us; you do not need to do anything there."

The banner also appears when an upgrade or an undo that you started yourself does not finish. It goes away once an upgrade or undo succeeds, or once Metis Cloud has dealt with the problem.

## Update or undo yourself

You can upgrade and undo from your instance's owner dashboard at any time, whether automatic updates are on or off:

1. Open your instance and click your initials at the bottom of the left rail. Choose **Dashboard**.
2. Open **System**, then **Updates**.

The **Updates** page works as on a self-hosted instance. See [Upgrade and undo](/self-hosting/operate/upgrade-and-undo). On Cloud, a snapshot of the database is always taken before an upgrade, so **Undo last upgrade** is offered after a successful upgrade. The steps on that page about the server do not apply to you: the snapshot folder, disk space and the `metis` commands. Steps there that mention the server or the updater are for Metis Cloud.

An automatic update shows on the **Updates** page like an upgrade you started yourself, in the **Last upgrade** card. You can undo it with **Undo last upgrade**. Undo puts the database back as it was when the update started, so everything written since then is lost. See [Undo the last upgrade](/self-hosting/operate/upgrade-and-undo#undo-the-last-upgrade).

To stay on the release you went back to, turn off automatic updates on the instance's [**Settings**](https://console.trymetis.email/instances/~/settings) tab.

## See which release your instance runs

The **Metis version** row in the **Details** card on the console's [**Overview**](https://console.trymetis.email/instances/~) shows the release your instance runs. Once setup is finished, the [**Overview**](https://console.trymetis.email/instances/~) does not refresh on its own. Reload it to see a new version after an update.
