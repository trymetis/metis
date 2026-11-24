---
title: Change or reset your password
description: Change your password from the Security settings, or reset it by email if you forgot it.
---

You can change your password while you are signed in, or reset it by email if you forgot it. Neither one changes your two-factor authentication: your authenticator app (if you have one), passkeys and backup codes keep working.

## Change your password

You need your current password. You also confirm it's you with a code from your authenticator app, a passkey or a backup code, depending on what your account has.

1. Open your account menu (the round button with your initials at the bottom of the left rail) and click **Security**.
2. In the **Change password** card, type your **Current password** and your **New password**.
3. Click **Change password**.
4. The **Confirm password change** box says "Confirm with your authenticator app, a passkey or a backup code." Enter a code from your authenticator app, or click **Use a passkey instead** and confirm with your passkey. If **Ask me first with** is set to **Passkey**, or you have no authenticator app, the box opens on **Use your passkey** in a browser that supports passkeys. To use a backup code, click **Use a backup code instead**. See [Switch between them](/guide/account/two-factor-authentication#switch-between-them).
5. Click **Verify**.

When it works, you see "Password changed. Other sessions were signed out." Every other browser where you were signed in is signed out. You stay signed in on this one.

If you got a [sign-in alert](/guide/account/sign-in-alerts) for a sign-in you did not make, change your password this way right away.

You can try to change your password 3 times every 10 seconds. After that, you see "Too many requests. Try again in 8 seconds.", or the time left. Wait for that time, then try again.

## Reset a forgotten password

1. On the sign-in page, click **Forgot password?**.
2. The page **Reset your password** opens. Enter your **Email address** and click **Send reset link**.

   <img src="/images/account/forgot-password.webp" alt="The Reset your password page with an email field and a Send reset link button" class="dark:hidden" />
   <img src="/images/account/forgot-password-dark.webp" alt="The Reset your password page with an email field and a Send reset link button" class="hidden dark:block" />

3. The page shows **Check your email**. For your privacy, it looks the same whether or not an account exists for that address.
4. Open the email from Metis Suite and click the reset link. The link is valid for 1 hour.
5. The page **Choose a new password** opens. Type your password in **New password** and again in **Confirm password**.
6. Click **Update password**.
7. You see **Password updated**, and Metis Suite takes you back to the sign-in page. Sign in with your new password. You still confirm it's you with your authenticator app, a passkey or a backup code.

If you see "This reset link is invalid or has expired.", the link is too old or no longer valid. Start again from **Forgot password?** to get a new one.

If you see "Passwords do not match", the two password fields are different. Type the same password in both.

You can ask for a reset link 5 times an hour. After that, the **Reset your password** page shows "Too many requests. Try again in 1 hour.", or the time left. Wait for that time, then click **Send reset link** again. See [Usage limits](/guide/reference/usage-limits#what-the-message-says).

To go back without resetting, click **Back to sign in**.
