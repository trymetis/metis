import { PEOPLE, type Person } from "../../lib/cast";
import { MIME, pdfDocument } from "../documents";
import { file, mail, type SeededMail } from "./build";

const { ana } = PEOPLE;

function sender(name: string, email: string): Person {
  return { name, email };
}

const LURES: [string, Person, string, string][] = [
  [
    "2026-09-15T03:12",
    sender("Konkan Bank", "security@konkan-bank-secure.com"),
    "Action required: your account **4821 is suspended",
    `<p>Dear Customer,</p><p>We detected unusual activity. Your account will be closed in 24 hours unless you verify your identity.</p><p><a href="https://konkan-bank-secure.com/verify?id=4821">Verify now</a></p>`,
  ],
  [
    "2026-09-02T22:40",
    sender("Codeyard Support", "support@c0deyard.dev"),
    "Your Codeyard account will be deleted",
    `<p>Hi,</p><p>Your organization fernhill violated our terms. Sign in within 48 hours to appeal.</p><p><a href="https://c0deyard.dev/login">Sign in to Codeyard</a></p>`,
  ],
  [
    "2026-08-19T05:05",
    sender("Mail Administrator", "admin@mailbox-quota-check.net"),
    "Your mailbox is full: 99% used",
    `<p>ana@demo.trymetis.email has reached its storage limit. Incoming mail will be returned.</p><p><a href="https://mailbox-quota-check.net/upgrade">Increase storage</a></p>`,
  ],
  [
    "2026-07-28T11:30",
    sender("Swiftpost Delivery", "notice@swiftpost-redelivery.co"),
    "We could not deliver your parcel",
    `<p>Your parcel is waiting at our depot. Pay the EUR 1.99 redelivery fee to schedule a new date.</p><p><a href="https://swiftpost-redelivery.co/pay">Pay and reschedule</a></p>`,
  ],
  [
    "2026-06-11T09:00",
    sender("Domain Services", "renewals@domain-registry-notice.org"),
    "Final notice: demo.trymetis.email domain renewal",
    `<p>Your domain listing expires today. Renew for USD 89 to avoid losing your search ranking.</p>`,
  ],
  [
    "2026-05-04T14:20",
    sender("Signflow", "documents@signflow-share.net"),
    "Ana, you have a document to sign",
    `<p>Raj Mehta sent you "Q2 bonus agreement.pdf" to review and sign.</p><p><a href="https://signflow-share.net/d/88213">Review document</a></p>`,
  ],
  [
    "2026-03-18T07:45",
    sender("SEO Growth Team", "hello@rankfast-agency.biz"),
    "Get Fernhill Studio to page one of Google",
    `<p>Hi there, I noticed your website is not ranking for "design studio Lisbon". We guarantee page one in 30 days.</p>`,
  ],
  [
    "2026-01-29T16:10",
    sender("Business Funding", "offers@quickcapital-loans.com"),
    "Pre-approved: EUR 50,000 for Fernhill Studio",
    `<p>Your business qualifies for a same-day loan. No paperwork, no credit check.</p>`,
  ],
  [
    "2025-12-08T13:00",
    sender("Global Design Summit", "speakers@design-summit-global.org"),
    "Invitation to speak at the Global Design Summit 2026",
    `<p>Dear Ana Silva, you have been selected as a keynote speaker. A registration fee of USD 1,450 secures your slot.</p>`,
  ],
  [
    "2025-10-21T04:30",
    sender("Instagram Growth", "team@followers-boost.io"),
    "10,000 real followers for your studio",
    `<p>Grow your studio's Instagram today. Packages from USD 19.</p>`,
  ],
  [
    "2025-08-14T18:15",
    sender("Lottery Department", "claims@intl-prize-office.com"),
    "Congratulations! You have won EUR 850,000",
    `<p>Your email address was selected in our annual draw. Send your full name and bank details to claim.</p>`,
  ],
];

export function spam(): SeededMail[] {
  const lures = LURES.map(([date, from, subject, html], i) =>
    mail({
      key: `spam/${i}`,
      from,
      to: [ana],
      subject,
      date,
      folder: "Junk",
      seen: i % 3 !== 0,
      html: `<html><body>${html}</body></html>`,
    }),
  );
  const invoice = mail({
    key: "spam/invoice",
    from: sender("Accounts Payable", "billing@ledgerl1ne-invoices.com"),
    to: [ana],
    subject: "Overdue invoice #88213, payment required today",
    date: "2026-09-09T06:30",
    folder: "Junk",
    seen: false,
    text: `Hello,

Please find attached the overdue invoice #88213 for EUR 4,870.00. Pay today to
avoid a late fee and suspension of your Ledgerline account.

Accounts Payable`,
    attachments: [
      file(
        "Invoice-88213.pdf",
        MIME.pdf,
        pdfDocument([
          ["INVOICE #88213", "Amount due: EUR 4,870.00", "Bank: see attached instructions"],
        ]),
      ),
    ],
  });
  return [...lures, invoice];
}
