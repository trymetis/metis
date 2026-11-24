---
title: Terms and privacy links
description: Ask new accounts to agree to your terms of service and privacy policy when they sign up.
---

You can ask everyone who creates an account to agree to your terms of service and privacy policy. This is off until you set at least one link.

## Set the links

1. Open **Dashboard**, **System**, **Instance**.
2. In the **Legal consent** card, enter the **Terms URL**, the **Privacy policy URL**, or both.
3. Click **Save changes** and [confirm it's you](/guide/account/two-factor-authentication#switch-between-them), then click **Save**.

The card's badge shows the current version, or **Off** when no link is set.

Once a link is set, the setup page, the page for signing up from an invitation and the open sign-up form show a checkbox that starts with "I agree to the" and links to your terms, your privacy policy, or both. People must tick it to create an account.

## Ask people to agree again

The **Version** field (default `1`) names the version of your terms. Change it when your terms change. As the field's hint says: "Changing it asks every new sign-up to agree again; existing consents keep the version they agreed to."

## Set the starting values in the environment

Before the first start, you can use `METIS_TERMS_URL`, `METIS_PRIVACY_URL` and `METIS_LEGAL_VERSION`. After the first start, change them in the dashboard.
