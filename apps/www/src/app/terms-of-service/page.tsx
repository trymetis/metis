import Link from "next/link";

import { LegalLayout } from "@/components/legal-layout";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT_EMAIL, ORG_ADDRESS, ORG_NAME, SITE_NAME } from "@/lib/site";

export const metadata = pageMetadata("/terms-of-service");

export default function TermsPage() {
  return (
    <LegalLayout
      path="/terms-of-service"
      title="Terms of Service"
      lastUpdated="November 3, 2026"
      intro={`These Terms of Service are a binding agreement between you and ${ORG_NAME} governing your use of ${SITE_NAME}. By creating an account or using the Service you accept these Terms and our Privacy Policy. If you do not agree, do not use the Service.`}
    >
      <h2>1. Agreement</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) are a binding agreement between you and{" "}
        <strong>{ORG_NAME}</strong> (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), {ORG_ADDRESS}
        , governing your use of {SITE_NAME} (the &quot;Service&quot;). By creating an account or
        using the Service you accept these Terms and our{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>. If you do not agree, do not use the
        Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        {SITE_NAME} is a suite for mail, calendars and drives that connects to accounts you already
        have — Gmail, Microsoft 365 and Outlook, Zoho, and IMAP, CalDAV, S3, WebDAV, FTP and SFTP
        servers — through each provider&apos;s official APIs and standard protocols. It adds
        features such as one list for every inbox, one week view for every calendar, one explorer
        for every drive, workspace search, workflows, snooze and scheduled send, AI-assisted
        classification, summaries, reply suggestions, an AI agent, and an MCP server. Your mail,
        events, and files remain hosted by your providers, subject to your agreements with them.
      </p>

      <h2>3. Eligibility and accounts</h2>
      <ul>
        <li>
          You must be at least 18 years old, or the age of majority in your jurisdiction, and
          capable of entering a binding contract.
        </li>
        <li>
          You must provide accurate registration information and keep your credentials confidential.
          Two-factor authentication is mandatory.
        </li>
        <li>
          You are responsible for all activity under your account. Notify us immediately at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you suspect unauthorized
          access.
        </li>
      </ul>

      <h2>4. Connected accounts</h2>
      <ul>
        <li>
          By connecting an account or server you authorize the Service to access its mail,
          calendars, or drives on your behalf under the permissions you grant, solely to provide the
          features you use. You may disconnect it at any time, which revokes our access.
        </li>
        <li>
          You represent that you are authorized to connect each account and server you connect (for
          example, that a work account may be used with third-party applications under your
          organization&apos;s policies).
        </li>
        <li>
          If you share a mailbox, calendar, or drive with a workspace, other members of that
          workspace will be able to access it through the Service. You are responsible for that
          decision.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>
          send spam, bulk unsolicited email, or email that violates applicable law (including
          anti-spam laws) or your email provider&apos;s policies;
        </li>
        <li>send scams, malware, or otherwise deceptive or harmful content;</li>
        <li>
          violate any law, infringe intellectual-property or privacy rights, or harass or harm
          others;
        </li>
        <li>
          probe, disrupt, overload, or circumvent security or rate limits of the Service or of the
          connected providers;
        </li>
        <li>
          access the Service by automated means outside the documented integrations (such as the MCP
          and agent endpoints) or resell it without our written consent.
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate this section. Email providers may
        additionally suspend their own API access for abusive sending behavior, which is outside our
        control.
      </p>

      <h2>6. AI features</h2>
      <ul>
        <li>
          AI-generated content — classifications, summaries, reply suggestions, workflow answers,
          and agent responses — is produced by machine-learning models and may be inaccurate,
          incomplete, or outdated. Review AI output before relying on it or sending it.
        </li>
        <li>
          Actions the AI agent takes on your mail, calendars, and drives happen only through the
          tools shown in the chat, and sending, deleting, and calendar, drive, or workflow changes
          require your explicit approval. You are responsible for actions you approve, and for what
          the MCP clients you authorize do with the tools you allow them.
        </li>
      </ul>

      <h2>7. Third-party services</h2>
      <p>
        The Service depends on third parties, including your mail, calendar, and drive providers
        (Google, Microsoft, Zoho, and the servers you connect), our infrastructure, backup, and
        console hosts, our payment provider, transactional email delivery, OpenRouter for the AI
        included with Metis Cloud plans, and the AI model providers your instance owner configures.
        The included AI is a monthly credit for each instance, routed only to model endpoints with a
        zero data retention policy; it resets on the billing day, cannot be topped up, and stops
        when it is used up until then. Use of a provider the owner configures is governed by the
        owner&apos;s agreement with it. Their availability and terms are outside our control, and
        your use of a connected provider remains governed by your agreement with that provider. Use
        of Google user data is described in our <Link href="/privacy-policy">Privacy Policy</Link>{" "}
        and adheres to the Google API Services User Data Policy, including its Limited Use
        requirements.
      </p>

      <h2>8. Your content and our rights</h2>
      <ul>
        <li>
          You retain all rights to your email, events, files, and the content you create. You grant
          us only the limited license needed to host, cache, process, transmit, and display that
          content in order to operate the Service for you.
        </li>
        <li>
          The {SITE_NAME} software is licensed under the GNU AGPL-3.0-or-later, and nothing in these
          Terms limits your rights under that license. These Terms govern your use of the hosted
          Service.
        </li>
      </ul>

      <h2>9. Availability and changes</h2>
      <p>
        We aim for reliable operation but the Service is provided without an uptime guarantee; it
        may be interrupted for maintenance, updates, or reasons outside our control. We may modify,
        add, or remove features, and may discontinue the Service with reasonable prior notice.
      </p>

      <h3>Fees</h3>
      <p>
        Metis Cloud plans are billed per instance, monthly or yearly in advance as you choose at
        checkout, at the prices shown on our <Link href="/pricing">pricing page</Link>. Payments are
        processed by Dodo Payments. We will announce price changes in advance, and they apply from
        your next billing period. A failed payment starts a grace period during which your instance
        keeps running. If your subscription is cancelled, expires, or is put on hold, your instance
        is suspended; you can download an export of your data for 30 days, after which the instance
        and its backups are deleted unless the subscription is renewed before then.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or
        terminate your access if you materially breach these Terms, if required by law, or if a
        provider withdraws API access necessary to serve you. On termination, your connected-account
        tokens and server logins are deleted and your data is handled as described in the{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>. Sections 8, 11, 12, and 13 survive
        termination.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;, WITHOUT WARRANTIES
        OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE,
        MERCHANTABILITY, NON-INFRINGEMENT, ACCURACY OF AI OUTPUT, OR UNINTERRUPTED OR ERROR-FREE
        OPERATION, TO THE MAXIMUM EXTENT PERMITTED BY LAW.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {ORG_NAME} shall not be liable for indirect,
        incidental, special, consequential, or punitive damages, or for loss of data, profits, or
        business, arising from or related to the Service. Our aggregate liability for all claims in
        any twelve-month period shall not exceed the amounts you paid us for the Service in that
        period or INR 5,000, whichever is greater. Nothing in these Terms limits liability that
        cannot be limited under applicable law.
      </p>

      <h2>13. Indemnity</h2>
      <p>
        You will indemnify and hold harmless {ORG_NAME} from claims arising out of your content,
        your use of the Service in violation of these Terms, or your violation of applicable law or
        third-party rights.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of India. All disputes arising out of or relating to
        these Terms or the Service are subject to the exclusive jurisdiction of the courts at Akola,
        Maharashtra, India.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be announced in the app
        or by email before they take effect, and the effective date above will be updated. Continued
        use of the Service after a change takes effect constitutes acceptance of the updated Terms.
      </p>

      <h2>16. Contact</h2>
      <p>
        {ORG_NAME}, {ORG_ADDRESS} &middot; <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalLayout>
  );
}
