import { LegalLayout } from "@/components/legal-layout";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT_EMAIL, ORG_ADDRESS, ORG_NAME, SITE_NAME } from "@/lib/site";

export const metadata = pageMetadata("/privacy-policy");

export default function PrivacyPage() {
  return (
    <LegalLayout
      path="/privacy-policy"
      title="Privacy Policy"
      lastUpdated="November 1, 2026"
      intro={`${SITE_NAME} lets you connect accounts you already have (mail, calendars and drives from Google, Microsoft and Zoho, and IMAP, CalDAV, S3, WebDAV, FTP and SFTP servers) and work with them in one suite, with optional AI features. This policy explains what data we collect, how we use it, who we share it with, and the choices you have. It applies to ${SITE_NAME} as we run it on Metis Cloud: the web application, the desktop and Android apps, the MCP server, and their associated APIs. ${SITE_NAME} is also open-source software that anyone can run on their own server; on a self-hosted instance, the person or organization running it decides how your data is handled and is responsible for it, and this policy does not apply.`}
    >
      <h2>1. Who we are</h2>
      <p>
        {SITE_NAME} (the &quot;Service&quot;) is a suite for mail, calendars and drives operated by{" "}
        <strong>{ORG_NAME}</strong> (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), {ORG_ADDRESS}
        . You can reach us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account information</h3>
      <ul>
        <li>
          Your name, email address, and a hashed password (or magic-link sign-in records) when you
          create a {SITE_NAME} account.
        </li>
        <li>
          Two-factor authentication data (your authenticator secret and backup codes, both stored
          encrypted), required for every account.
        </li>
        <li>
          Workspace membership records (workspaces you create or join, your role, and invitations
          you send or accept).
        </li>
      </ul>
      <h3>Metis Cloud billing</h3>
      <ul>
        <li>
          If you subscribe to Metis Cloud: your console account (name, email address, and a hashed
          password) and your subscription records (plan, status, and billing period). Payments are
          processed by Dodo Payments; your card details go to them and never reach us.
        </li>
      </ul>
      <h3>Connected account data</h3>
      <ul>
        <li>
          OAuth access and refresh tokens for each account you connect (Google, Microsoft, or Zoho),
          together with the account email address and provider, and the login details for each IMAP,
          CalDAV, S3, WebDAV, FTP or SFTP server you connect.
        </li>
        <li>
          Email data fetched from your provider on your behalf: message headers, bodies,
          attachments, labels, and thread information. Most of this is fetched on demand and
          displayed to you; a limited subset is cached (see Section 6).
        </li>
        <li>
          Calendar data fetched on your behalf: calendars, events, guests, and invitation responses.
        </li>
        <li>
          Drive data fetched on your behalf: file and folder listings, and file contents when you
          preview, download, or upload a file or save an attachment to a drive.
        </li>
        <li>
          Records you create in the Service: workflows and their run history, custom labels,
          snoozes, scheduled sends, mute lists, unsubscribe history, drafts, saved searches, pinned
          folders, MCP client grants, and AI conversation threads.
        </li>
      </ul>
      <h3>Technical information</h3>
      <ul>
        <li>
          Standard server logs (IP address, browser type, timestamps, requested pages) used for
          security, rate limiting, and debugging.
        </li>
        <li>
          The IP address and browser of each signed-in session, stored with the session. If you turn
          on sign-in alerts, each alert email shows the device and IP address of the sign-in.
        </li>
        <li>
          A security activity log of security-relevant changes, such as turning off two-factor
          authentication, approving an MCP client, disconnecting an account, or changing a
          member&apos;s role, with the time, who made the change, and the IP address and browser it
          came from. It never records reading mail, events, or files.
        </li>
      </ul>
      <h3>Cookies and browser storage</h3>
      <p>
        We do not collect data for advertising, and we do not use tracking or advertising cookies.
        The only cookies we set are strictly necessary: your sign-in session and a copy of it that
        refreshes every five minutes, a short-lived cookie that returns you to the right page after
        two-factor verification, and a one-time cookie that protects the sign-in to your provider
        while you connect an account. Your light or dark theme is kept in your browser&apos;s local
        storage, and file previews are cached in your browser&apos;s private storage and cleared
        when you sign out.
      </p>

      <h2>3. Google user data</h2>
      <p>
        When you connect a Google account, {SITE_NAME} requests the scopes for the parts you connect
        (mail, calendar, drive, or any combination) from the following Google OAuth scopes:
      </p>
      <ul>
        <li>
          <strong>openid, userinfo.email, userinfo.profile</strong> — to identify the Google account
          you connected and display its email address and name inside the app.
        </li>
        <li>
          <strong>gmail.modify</strong> — to list and read your messages and threads; mark messages
          read or unread; star, archive, restore, move to trash, and label messages; create, update,
          and delete drafts; apply the inbox rules you configure; and retrieve message content for
          the AI features you invoke.
        </li>
        <li>
          <strong>gmail.send</strong> — to send email from your account only when you (or an action
          you explicitly approved or scheduled) trigger it: composing, replying, forwarding,
          scheduled &quot;send later&quot;, and sending unsubscribe requests you initiate.{" "}
          {SITE_NAME} never sends email autonomously.
        </li>
        <li>
          <strong>calendar</strong> — to list your calendars and events, create, edit, move, and
          delete events, invite guests, and answer invitations when you (or an action you explicitly
          approved) do so.
        </li>
        <li>
          <strong>drive</strong> — to browse, search, and preview your files, upload files and save
          email attachments where you choose, create folders, and rename, move, or delete files when
          you (or an action you explicitly approved) do so.
        </li>
      </ul>
      <p>
        <strong>Limited Use disclosure.</strong> {SITE_NAME}&apos;s use and transfer to any other
        application of information received from Google APIs will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically:
      </p>
      <ul>
        <li>
          We only use Google user data to provide and improve the user-facing features of{" "}
          {SITE_NAME} described in this policy. We do not use it for any other purpose.
        </li>
        <li>
          We do not transfer Google user data to third parties except as necessary to provide or
          improve those user-facing features (see Section 7), to comply with applicable law, or as
          part of a merger, acquisition, or sale of assets after obtaining your explicit prior
          consent.
        </li>
        <li>
          We do not use or transfer Google user data for serving advertisements, and we do not sell
          it to anyone.
        </li>
        <li>
          We do not allow humans to read your Google user data unless (a) we have your affirmative
          agreement for a specific message, (b) it is necessary for security purposes such as
          investigating abuse, (c) it is necessary to comply with applicable law, or (d) the data
          has been aggregated and anonymized for internal operations.
        </li>
        <li>
          We do not use Google user data, including Gmail content, to develop, improve, or train
          generalized artificial intelligence or machine-learning models.
        </li>
      </ul>

      <h2>4. Microsoft and Zoho user data</h2>
      <p>
        When you connect a Microsoft account, {SITE_NAME} requests these Microsoft permissions for
        the parts you connect:
      </p>
      <ul>
        <li>
          <strong>openid, email, profile, User.Read</strong> — to identify the account you connected
          and display its email address and name.
        </li>
        <li>
          <strong>offline_access</strong> — to keep working on your behalf, such as sending a
          scheduled message, without asking you to sign in again.
        </li>
        <li>
          <strong>Mail.ReadWrite, Mail.Send</strong> — to read and organize your mail and to send it
          when you (or an action you explicitly approved or scheduled) do so.
        </li>
        <li>
          <strong>Calendars.ReadWrite</strong> — to show and manage your calendars and events.
        </li>
        <li>
          <strong>Files.ReadWrite</strong> — to browse, preview, and manage your OneDrive files.
        </li>
      </ul>
      <p>
        Microsoft offers no way for an app to give back its access. When you disconnect a Microsoft
        account we delete its tokens and stop using it, and you remove {SITE_NAME}&apos;s permission
        yourself at account.microsoft.com (personal accounts) or myapps.microsoft.com (work or
        school accounts).
      </p>
      <p>
        When you connect a Zoho account, {SITE_NAME} requests{" "}
        <strong>AaaServer.profile.READ</strong> to identify the account,{" "}
        <strong>ZohoMail.messages.ALL</strong>, <strong>ZohoMail.folders.ALL</strong>, and{" "}
        <strong>ZohoMail.accounts.READ</strong> for mail, and{" "}
        <strong>ZohoCalendar.calendar.ALL</strong> and <strong>ZohoCalendar.event.ALL</strong> for
        calendars. When you disconnect a Zoho account, we ask Zoho to revoke the grant.
      </p>

      <h2>5. How we use your data</h2>
      <ul>
        <li>
          <strong>Core mail, calendar, and drive features</strong> — displaying your folders,
          messages, and threads; sending, replying, and forwarding; drafts; attachments; labels;
          archive, trash, star, and read-state changes; snooze and scheduled send; showing,
          creating, and editing events; browsing, previewing, and managing files; search across
          mail, events, and files; and the workflows you configure.
        </li>
        <li>
          <strong>AI features you turn on</strong> — automatic message classification into labels,
          smart reply suggestions, thread summaries, workflow questions, and the AI agent, which can
          read and act on your mail, calendars, and drives only within the tools and approvals you
          grant it in the chat interface. Sending, deleting, and calendar, drive, or workflow
          changes require your explicit in-chat approval.
        </li>
        <li>
          <strong>Service operation</strong> — authentication, two-factor verification, workspace
          management and sharing of mailboxes, calendars, and drives, rate limiting, abuse
          prevention, and debugging.
        </li>
        <li>
          <strong>Transactional email</strong> — sign-in links, verification emails, password
          resets, and workspace invitations from your instance, and verification emails for your
          Metis Cloud console account.
        </li>
        <li>
          <strong>Billing</strong> — running your Metis Cloud subscription, and suspending and
          deleting an instance whose subscription has ended.
        </li>
      </ul>
      <h3>Legal bases</h3>
      <ul>
        <li>
          <strong>To provide the Service you signed up for</strong> (performance of a contract):
          your account, connected accounts, core mail, calendar, and drive features, workflows,
          transactional email, and billing.
        </li>
        <li>
          <strong>Your consent</strong>: the AI features, phishing detection, and MCP clients you
          turn on. You can withdraw consent at any time by turning the feature off or removing the
          client; this does not affect processing that already happened.
        </li>
        <li>
          <strong>Our legitimate interests</strong> in keeping the Service secure and working:
          server logs, session records, security activity, rate limiting, abuse prevention, and
          debugging.
        </li>
        <li>
          <strong>Legal obligations</strong>: keeping server logs for the period the law requires,
          keeping the record of your acceptance of our Terms and this policy, and responding to
          lawful requests.
        </li>
      </ul>

      <h2>6. What we store and for how long</h2>
      <ul>
        <li>
          <strong>OAuth tokens and server logins</strong> are encrypted in our database and used
          solely to reach your provider or server on your behalf. They are deleted when you
          disconnect the account or delete your {SITE_NAME} account, and we ask the provider to
          revoke the grant where the provider supports it.
        </li>
        <li>
          <strong>Message cache</strong> — to avoid re-downloading the same content, we cache the
          bodies of messages you open or that the features you use require (for example thread
          summaries and smart replies), along with their analysis results, keyed to your account. We
          do not maintain a full copy of your mailbox.
        </li>
        <li>
          <strong>Derived records</strong> — labels assigned to messages, thread summaries,
          unsubscribe history, scheduled items, saved searches, and workflow run history are stored
          so the features work across sessions.
        </li>
        <li>
          <strong>Scheduled messages</strong> — the content of a message you schedule is stored
          until it is sent or you cancel it. If sending fails, it is kept until the send is retried,
          confirmed, or cancelled, so a message is never sent twice or lost.
        </li>
        <li>
          <strong>Failed workflow runs</strong> — when a workflow run fails, the results of its
          steps are kept for 7 days so you can retry it, and then cleared.
        </li>
        <li>
          <strong>Security activity</strong> is kept for one year and then deleted.
        </li>
        <li>
          <strong>AI agent conversations</strong> are stored so you can revisit them, and can be
          deleted by you at any time.
        </li>
      </ul>
      <p>
        All data is encrypted in transit (TLS). On Metis Cloud, your instance and its database run
        on their own storage volume on our servers in Helsinki, Finland, and are backed up
        continuously to Cloudflare R2, which encrypts them at rest. Account tokens and server logins
        are also encrypted by {SITE_NAME} itself before they are stored. Access to production
        systems is restricted to authorized personnel of {ORG_NAME} and protected by strong
        authentication.
      </p>
      <p>
        When you disconnect an account, we delete its OAuth tokens or server login and cease all
        access to it. When you delete your {SITE_NAME}
        account, or on a verified request to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        , we delete your account data, cached message content, and derived records within 30 days,
        except where retention is required by law. Three kinds of record are kept after your account
        is deleted, no longer linked to it: the record that you accepted our Terms and this policy
        (your email address, the version, and the time), records of AI usage (the feature, model,
        and token counts, never the content), and the security activity you took part in, which
        keeps your email address until it is deleted after one year. When a Metis Cloud subscription
        ends, the instance is suspended, and 30 days later it is deleted together with its backups.
        Server logs are kept for one year, as India&apos;s Digital Personal Data Protection Rules,
        2025 require, and then deleted.
      </p>

      <h2>7. Sharing and third-party processors</h2>
      <p>
        We never sell your data. We share it only with the processors needed to run the Service:
      </p>
      <ul>
        <li>
          <strong>Your providers</strong> (Google, Microsoft, Zoho, and the servers you connect) —
          every mail, calendar, and drive action you take is executed against your provider&apos;s
          API or server.
        </li>
        <li>
          <strong>Infrastructure hosting</strong> (Hetzner) — dedicated servers in Helsinki,
          Finland, that run your Metis Cloud instance and its database, which stores the data
          described in Section 6.
        </li>
        <li>
          <strong>Backups and DNS</strong> (Cloudflare) — continuous backups of your instance&apos;s
          database in Cloudflare R2, deleted with the instance, and DNS for trymetis.email and
          metis-suite.app addresses.
        </li>
        <li>
          <strong>Console hosting</strong> (Vercel) — runs the Metis Cloud console where you sign
          up, pay for, and manage your instance, and stores your console account and subscription
          records.
        </li>
        <li>
          <strong>Payments</strong> (Dodo Payments) — processes Metis Cloud subscription payments.
          Your mail, calendars, and files are never shared with Dodo Payments.
        </li>
        <li>
          <strong>Console email</strong> (Resend) — delivers verification email for your console
          account. Your mail, calendars, and files are never shared with Resend. Email from your
          instance, such as sign-in links and invitations, is delivered to your console inbox unless
          your instance owner sets up their own mail service.
        </li>
        <li>
          <strong>AI model providers you choose</strong> — {SITE_NAME} does not provide AI models.
          AI features use the provider whose key your instance owner configures. When an AI feature
          you turned on runs, the messages, events, or files it requires are sent to that provider,
          under the owner&apos;s agreement with it, solely to generate that response. AI features
          never send your whole mailbox, calendar, or drive.
        </li>
        <li>
          <strong>Phishing detection</strong> (operated by {ORG_NAME}) — when phishing detection is
          on for a mailbox, each message checked is sent in full (headers, body, and attachments) to
          our separate phishing detection service, which returns a risk verdict. It is off unless
          the mailbox&apos;s workspace turns it on.
        </li>
      </ul>
      <p>
        If you connect an MCP client, the external AI client you authorize via OAuth can access your
        mail, calendars, and drives in the workspaces and through the tools you permit. Tools that
        send, delete, or change things, such as sending or deleting email and creating or running
        workflows, stay off until you turn them on for that client. Once a tool is on, the client
        uses it without asking you each time, because MCP has no step for approving a single action.
        You control these grants and can pause or revoke them at any time in settings.
      </p>
      <p>
        If you are a member of a workspace, mailboxes, calendars, and drives shared with that
        workspace are visible to its other members.
      </p>
      <p>
        We may disclose data where required by law, court order, or a governmental authority with
        jurisdiction, or where necessary to protect the rights, safety, or security of the Service
        or its users.
      </p>

      <h2>8. Your rights and choices</h2>
      <ul>
        <li>
          Disconnect any account at any time from Settings &rarr; Connections; this deletes its
          tokens or login and stops our access. For Google and Zoho we also ask the provider to
          revoke the grant; for Microsoft you remove it yourself (see Section 4).
        </li>
        <li>
          Revoke {SITE_NAME}&apos;s access directly from your provider: Google Account &rarr;{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Security &rarr; Third-party access
          </a>
          , Microsoft at{" "}
          <a href="https://account.microsoft.com/privacy" target="_blank" rel="noopener noreferrer">
            account.microsoft.com
          </a>{" "}
          or{" "}
          <a href="https://myapps.microsoft.com" target="_blank" rel="noopener noreferrer">
            myapps.microsoft.com
          </a>
          , or the connected apps settings of your Zoho account.
        </li>
        <li>
          Download a copy of the data {SITE_NAME} keeps for your account (preferences, workspaces,
          labels, workflows, Workspace Assistant chats, and security activity) from Settings &rarr;
          Account &rarr; Export your data. Your mail, events, and files stay with your provider;
          export those from the provider.
        </li>
        <li>
          Request access to, correction of, or deletion of your personal data, or raise a complaint,
          by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </li>
        <li>
          If you are in the European Economic Area, the United Kingdom, or Switzerland, you also
          have the right to data portability, to restrict processing, and to object to processing
          based on our legitimate interests, and you can complain to your local data protection
          supervisory authority.
        </li>
        <li>
          Under India&apos;s Digital Personal Data Protection Act, 2023, you have the right to
          access, correct, and erase your personal data, to nominate a representative, and to
          grievance redressal. If our response to a grievance does not resolve it, you can complain
          to the Data Protection Board of India.
        </li>
      </ul>
      <p>
        <strong>Grievance Officer:</strong> {ORG_NAME}, {ORG_ADDRESS},{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We acknowledge grievances within 72
        hours and aim to resolve them within 15 days.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is not directed to children. You must be at least 18 years old, or the age of
        majority in your jurisdiction, to use {SITE_NAME}. We do not knowingly collect personal data
        from children; if you believe a child has provided us data, contact us and we will delete
        it.
      </p>

      <h2>10. International transfers</h2>
      <p>
        Metis Cloud instances and their data are stored in Finland, in the European Union. We are
        based in India, and our processors may store or process data in countries other than yours
        (including the United States and the European Union). When personal data from the European
        Economic Area, the United Kingdom, or Switzerland goes to a country without an adequacy
        decision, the transfer is covered by the European Commission&apos;s Standard Contractual
        Clauses (with the UK and Swiss addenda) or another transfer mechanism the law recognizes,
        together with the safeguards described in this policy.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be announced in the app
        or by email before they take effect, and the effective date above will be updated. Continued
        use of the Service after a change takes effect constitutes acceptance of the updated policy.
      </p>

      <h2>12. Governing law and contact</h2>
      <p>
        This policy is governed by the laws of India, and any disputes are subject to the exclusive
        jurisdiction of the courts at Akola, Maharashtra, India. Questions about this policy:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
