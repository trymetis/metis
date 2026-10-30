import { PEOPLE, SENDERS } from "../../lib/cast";
import { MIME, pdfDocument } from "../documents";
import { vcalendar } from "../ics";
import { type Folder, file, mail, type SeededMail } from "./build";

const { ana, raj, tomas, priya, sam, kenji, lena } = PEOPLE;
const AUTO: [string, string][] = [["Auto-Submitted", "auto-generated"]];

function folderFor(date: string, recentFrom: string, older: Folder = "Archive"): Folder {
  return date >= recentFrom ? "INBOX" : older;
}

function bank(): SeededMail[] {
  const debits: [string, string, string, string][] = [
    ["2024-11-28T05:02", "2,340.00", "brightloom.in@konkan", "48,901.10"],
    ["2025-01-14T06:40", "860.00", "metro.pune@upi", "61,220.75"],
    ["2025-02-20T12:15", "12,500.00", "fernhill.rent@konkan", "52,004.30"],
    ["2025-04-03T08:22", "1,099.00", "linkroom.billing@upi", "70,515.60"],
    ["2025-05-30T19:48", "3,480.00", "tavola.mumbai@upi", "66,802.10"],
    ["2025-07-11T09:05", "540.00", "chaiwala.store@konkan", "59,330.45"],
    ["2025-08-26T14:30", "7,850.00", "northbeamair@upi", "41,276.00"],
    ["2025-10-09T10:12", "2,150.00", "kestrelsupply@upi", "57,940.80"],
    ["2025-12-19T17:55", "4,200.00", "giftshop.goa@upi", "63,118.25"],
    ["2026-02-04T07:30", "1,260.00", "chaiwala.store@konkan", "71,402.90"],
    ["2026-04-17T13:44", "6,300.00", "swiftpost.in@upi", "55,610.15"],
    ["2026-06-08T09:18", "980.00", "metro.pune@upi", "60,072.40"],
    ["2026-08-02T20:05", "2,760.00", "tavola.mumbai@upi", "52,833.70"],
    ["2026-09-12T06:55", "450.00", "chaiwala.store@konkan", "49,460.55"],
  ];
  const alerts = debits.map(([date, amount, vpa, balance], i) => {
    const ref = String(427310000000 + i * 7919);
    const day = date.slice(8, 10);
    const month = date.slice(5, 7);
    const year = date.slice(2, 4);
    return mail({
      key: `bank/debit/${i}`,
      from: SENDERS.konkan,
      to: [ana],
      subject: `INR ${amount} debited from a/c **4821`,
      date,
      folder: folderFor(date, "2026-03-01"),
      headers: AUTO,
      text: `Dear Customer, INR ${amount.replace(",", "")} has been debited from account **4821 to
VPA ${vpa} on ${day}-${month}-${year}. UPI Ref ${ref}.
Available balance: INR ${balance}.
Not you? Call 1800 266 4821 to block your account.`,
    });
  });
  const refund = mail({
    key: "bank/refund",
    from: SENDERS.konkan,
    to: [ana],
    subject: "INR 6,300.00 credited to a/c **4821",
    date: "2026-04-29T11:20",
    headers: AUTO,
    text: `Dear Customer, INR 6300.00 has been credited to account **4821 from
swiftpost.in@upi (refund) on 29-04-26. UPI Ref 427319442210.
Available balance: INR 61,910.15.`,
  });
  const hindi = mail({
    key: "bank/hindi",
    from: SENDERS.konkan,
    to: [ana],
    subject: "खाता **4821 से INR 3,100.00 डेबिट",
    date: "2026-07-19T10:02",
    headers: AUTO,
    text: `प्रिय ग्राहक, आपके खाते **4821 से 19-07-26 को INR 3100.00 kestrelsupply@upi को डेबिट किए गए हैं।
UPI संदर्भ 427315550901। उपलब्ध शेष: INR 57,212.30।
यदि यह लेनदेन आपने नहीं किया है, तो 1800 266 4821 पर कॉल करें।`,
  });
  const periods: [string, string][] = [
    ["2025-12-01T03:00", "September to November 2025"],
    ["2026-03-01T03:00", "December 2025 to February 2026"],
    ["2026-06-01T03:00", "March to May 2026"],
    ["2026-09-01T03:00", "June to August 2026"],
  ];
  const statements = periods.map(([date, period], i) => {
    return mail({
      key: `bank/statement/${i}`,
      from: SENDERS.konkan,
      to: [ana],
      subject: `Your Konkan Bank statement for ${period}`,
      date,
      folder: folderFor(date, "2026-06-01"),
      headers: AUTO,
      text: `Dear Ana Silva,

Your account statement for ${period} is attached. Open it with your date of birth
in DDMMYYYY format.

Konkan Bank`,
      attachments: [
        file(
          `Statement-4821-${date.slice(0, 7)}.pdf`,
          MIME.pdf,
          pdfDocument([
            [
              `Konkan Bank - Statement for account **4821`,
              `Period: ${period}`,
              "Opening and closing balances are listed by month.",
            ],
          ]),
        ),
      ],
    });
  });
  return [...alerts, refund, hindi, ...statements];
}

function orders(): SeededMail[] {
  const items: [string, string, string, string, Folder][] = [
    ["A-17", "2025-02-11T14:05", "Oak pen tray", "EUR 38.00", "Archive"],
    ["A-23", "2025-06-19T09:40", "Linen table runner", "EUR 54.00", "Archive"],
    ["A-31", "2026-04-12T20:15", "Ceramic pour-over set", "R$ 389,90", "INBOX"],
    ["A-38", "2026-07-30T18:22", "Brass bookends", "EUR 72.00", "INBOX"],
    ["A-42", "2026-09-18T19:02", "Walnut desk lamp", "EUR 129.00", "INBOX"],
  ];
  return items.map(([order, date, item, total, folder]) =>
    mail({
      key: `order/${order}`,
      from: SENDERS.brightloom,
      to: [ana],
      subject: `Thanks for your order ${order}`,
      date,
      folder,
      html: `<html><body>
<h2>Thanks for your order, Ana</h2>
<p>Order ${order} is confirmed. We will email you when it ships.</p>
<table>
<tr><td>${item}</td><td>${total}</td></tr>
<tr><td>Shipping</td><td>Free</td></tr>
<tr><td><strong>Total</strong></td><td><strong>${total}</strong></td></tr>
</table>
<p>Brightloom · <a href="https://brightloom.com/orders/${order}">View your order</a></p>
</body></html>`,
    }),
  );
}

function shipments(): SeededMail[] {
  const updates: [string, string, string, string, string, Folder][] = [
    [
      "A-17",
      "2025-02-13T08:00",
      "delivered",
      "Your Swiftpost parcel was delivered",
      "Delivered to the front desk at 11:42.",
      "Archive",
    ],
    [
      "A-31",
      "2026-04-15T07:30",
      "shipped",
      "Your parcel from Brightloom is on its way",
      "Expected between April 18 and April 21.",
      "Archive",
    ],
    [
      "A-31",
      "2026-04-20T16:10",
      "delayed",
      "Your parcel is delayed",
      "Customs are checking your parcel. New estimate: April 24.",
      "INBOX",
    ],
    [
      "A-31",
      "2026-04-24T12:55",
      "delivered",
      "Your Swiftpost parcel was delivered",
      "Delivered and signed for by A. Silva at 12:51.",
      "INBOX",
    ],
    [
      "A-38",
      "2026-08-01T07:45",
      "shipped",
      "Your parcel from Brightloom is on its way",
      "Expected on August 4.",
      "INBOX",
    ],
    [
      "A-38",
      "2026-08-04T06:30",
      "out for delivery",
      "Your parcel is out for delivery today",
      "Your driver will arrive between 10:00 and 13:00.",
      "INBOX",
    ],
    [
      "A-38",
      "2026-08-04T11:20",
      "delivered",
      "Your Swiftpost parcel was delivered",
      "Delivered to your mailbox at 11:16.",
      "INBOX",
    ],
  ];
  const english = updates.map(([order, date, state, subject, line, folder], i) => {
    const tracking = `SP${4471920300 + i * 17}PT`;
    return mail({
      key: `shipment/${order}/${state}`,
      from: SENDERS.swiftpost,
      to: [ana],
      subject,
      date,
      folder,
      headers: AUTO,
      html: `<html><body>
<p>Parcel ${tracking} for Brightloom order ${order}: <strong>${state}</strong>.</p>
<p>${line}</p>
<p><a href="https://swiftpost.com/track/${tracking}">Track your parcel</a></p>
</body></html>`,
    });
  });
  const hindi = mail({
    key: "shipment/hindi",
    from: SENDERS.swiftpost,
    to: [ana],
    subject: "आपका पार्सल डिलीवरी के लिए निकल चुका है",
    date: "2025-10-11T05:40",
    folder: "Archive",
    headers: AUTO,
    text: `नमस्ते Ana,
आपका Swiftpost पार्सल SP4471988810IN आज डिलीवर किया जाएगा।
अनुमानित समय: सुबह 10 बजे से दोपहर 1 बजे तक।
ट्रैक करें: https://swiftpost.com/track/SP4471988810IN`,
  });
  return [...english, hindi];
}

function bills(): SeededMail[] {
  const ledgerline = [
    "2025-10-01",
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
  ].map((day, i) => {
    const number = `LL-${String(2025100 + i)}`;
    return mail({
      key: `bill/ledgerline/${i}`,
      from: SENDERS.ledgerline,
      to: [ana],
      subject: `Your Ledgerline invoice ${number}`,
      date: `${day}T06:00`,
      folder: folderFor(day, "2026-05-01"),
      headers: AUTO,
      text: `Hi Ana,

Your invoice ${number} for Fernhill Studio is ready.
Plan: Studio, 5 seats. Amount: EUR 95.00. It will be charged to the card ending 0617
on ${day}.

Ledgerline`,
      attachments: [
        file(
          `${number}.pdf`,
          MIME.pdf,
          pdfDocument([
            [
              `Ledgerline invoice ${number}`,
              "Fernhill Studio",
              "Studio plan, 5 seats: EUR 95.00",
              `Date: ${day}`,
            ],
          ]),
        ),
      ],
    });
  });
  const voltaro: [string, string, string, boolean][] = [
    ["2025-03-08T07:00", "GBP 214.60", "March 31, 2025", false],
    ["2025-06-08T07:00", "GBP 168.20", "June 30, 2025", false],
    ["2025-09-08T07:00", "GBP 152.90", "September 30, 2025", false],
    ["2025-12-08T07:00", "GBP 241.75", "December 31, 2025", false],
    ["2026-03-08T07:00", "GBP 229.10", "March 31, 2026", false],
    ["2026-09-08T07:00", "GBP 149.40", "September 30, 2026", true],
  ];
  const energy = voltaro.map(([date, amount, due, recent], i) =>
    mail({
      key: `bill/voltaro/${i}`,
      from: SENDERS.voltaro,
      to: [ana],
      subject: "Your Voltaro Energy bill is ready",
      date,
      folder: recent ? "INBOX" : "Archive",
      seen: !recent,
      headers: AUTO,
      html: `<html><body>
<p>Hello Ana,</p>
<p>Your electricity bill for the London desk at 4 Calvert Yard is ready.</p>
<p><strong>Amount due: ${amount}</strong> by ${due}.</p>
<p><a href="https://voltaro.co.uk/account/bills">View and pay your bill</a></p>
</body></html>`,
    }),
  );
  const paid = ["2025-12-29T10:00", "2026-03-27T10:00"].map((date, i) =>
    mail({
      key: `bill/voltaro/paid/${i}`,
      from: SENDERS.voltaro,
      to: [ana],
      subject: "Payment received, thank you",
      date,
      folder: i === 0 ? "Archive" : "INBOX",
      headers: AUTO,
      text: `Hello Ana, we received your payment of ${i === 0 ? "GBP 241.75" : "GBP 229.10"}. Your balance is now GBP 0.00.

Voltaro Energy`,
    }),
  );
  return [...ledgerline, ...energy, ...paid];
}

function subscriptions(): SeededMail[] {
  return [
    mail({
      key: "subscription/ledgerline-trial",
      from: SENDERS.ledgerline,
      to: [ana],
      subject: "Your Ledgerline trial ends in 3 days",
      date: "2025-09-26T09:00",
      folder: "Archive",
      text: `Hi Ana, your free trial of Ledgerline Studio ends on September 29, 2025.
Add a card to keep your books, invoices and 5 seats. Plans start at EUR 95 a month.`,
    }),
    mail({
      key: "subscription/linkroom-renewal",
      from: SENDERS.linkroom,
      to: [ana],
      subject: "Your Linkroom Pro plan renews on October 3",
      date: "2026-09-19T08:00",
      seen: false,
      text: `Hi Ana,

Your Linkroom Pro plan for Fernhill Studio renews on October 3, 2026 for USD 240.00
a year. No action is needed. To change seats or cancel, visit your billing settings.

Linkroom`,
    }),
    mail({
      key: "subscription/codeyard-renewed",
      from: SENDERS.codeyard,
      to: [ana],
      subject: "Your Codeyard Team subscription has been renewed",
      date: "2026-02-14T00:30",
      folder: "Archive",
      text: `Your Codeyard Team subscription for the fernhill organization was renewed for
another year. Amount charged: USD 480.00 to the card ending 0617.`,
    }),
  ];
}

function codes(): SeededMail[] {
  const codeyard = [
    ["2025-05-06T10:12", "731904", "Archive"],
    ["2025-11-21T08:44", "205877", "Trash"],
    ["2026-03-02T09:01", "664120", "Trash"],
    ["2026-07-15T13:37", "918356", "Trash"],
    ["2026-09-05T07:58", "347291", "Archive"],
  ] as const;
  const otp = codeyard.map(([date, code, folder], i) =>
    mail({
      key: `otp/codeyard/${i}`,
      from: SENDERS.codeyard,
      to: [ana],
      subject: "[Codeyard] Your sign-in verification code",
      date,
      folder,
      headers: AUTO,
      text: `Here is your Codeyard sign-in verification code: ${code}

This code expires in 10 minutes. If you did not try to sign in, change your password.`,
    }),
  );
  const ledgerline = ["2026-06-03T07:20", "2026-09-07T07:05"].map((date, i) =>
    mail({
      key: `otp/ledgerline/${i}`,
      from: SENDERS.ledgerline,
      to: [ana],
      subject: "Your Ledgerline login code",
      date,
      headers: AUTO,
      text: `Your Ledgerline login code is ${["58 21 07", "90 46 13"][i]}. It is valid for 5 minutes.`,
    }),
  );
  const links = [
    mail({
      key: "link/paperstack",
      from: SENDERS.paperstack,
      to: [ana],
      subject: "Your Paperstack sign-in link",
      date: "2026-08-27T15:22",
      headers: AUTO,
      html: `<html><body><p>Click the button to sign in to Paperstack. The link expires in 15 minutes.</p>
<p><a href="https://paperstack.app/auth/magic?token=pz8Hq2LkV0">Sign in to Paperstack</a></p></body></html>`,
    }),
    mail({
      key: "link/linkroom-confirm",
      from: SENDERS.linkroom,
      to: [ana],
      subject: "Confirm your email for Linkroom",
      date: "2024-11-05T10:00",
      folder: "Archive",
      headers: AUTO,
      html: `<html><body><p>Welcome to Linkroom! Please confirm your email address.</p>
<p><a href="https://linkroom.app/confirm?t=7Rk2w9">Confirm email</a></p></body></html>`,
    }),
  ];
  return [...otp, ...ledgerline, ...links];
}

function security(): SeededMail[] {
  return [
    mail({
      key: "security/codeyard-device",
      from: SENDERS.codeyard,
      to: [ana],
      subject: "[Codeyard] New sign-in from Firefox on Linux",
      date: "2026-09-05T08:00",
      headers: AUTO,
      text: `We noticed a new sign-in to your Codeyard account.

Browser: Firefox on Linux
Location: Lisbon, Portugal
Time: September 5, 2026, 07:59 UTC

If this was you, you can ignore this email. If not, reset your password and review
your active sessions.`,
    }),
    mail({
      key: "security/ledgerline-password",
      from: SENDERS.ledgerline,
      to: [ana],
      subject: "Your Ledgerline password was changed",
      date: "2026-01-27T19:30",
      folder: "Archive",
      headers: AUTO,
      text: `The password for ana@demo.trymetis.email was changed on January 27, 2026 at 19:29 UTC.
If you did not make this change, contact support right away.`,
    }),
    mail({
      key: "security/konkan-device",
      from: SENDERS.konkan,
      to: [ana],
      subject: "New device registered for mobile banking",
      date: "2026-05-22T16:48",
      headers: AUTO,
      text: `Dear Customer, a new device (Pixel 9) was registered for Konkan mobile banking on
22-05-26 at 16:47 IST. If this was not you, call 1800 266 4821 immediately.`,
    }),
  ];
}

function meetings(): SeededMail[] {
  const weekly = vcalendar(
    [
      {
        uid: "ana-raj-1on1@demo.trymetis.email",
        stamp: "2026-01-05T09:00:00",
        summary: "Weekly 1:1 Ana / Raj",
        start: "2026-01-06T10:00:00",
        end: "2026-01-06T10:30:00",
        timeZone: "Europe/Lisbon",
        rrule: "FREQ=WEEKLY;BYDAY=TU",
        location: "https://linkroom.app/r/ana-raj",
        organizer: raj,
        attendees: [[ana, "NEEDS-ACTION"]],
      },
    ],
    "REQUEST",
  );
  const logoReview = (sequence: number, start: string, end: string) =>
    vcalendar(
      [
        {
          uid: "aozora-logo-review@demo.trymetis.email",
          stamp: "2026-09-01T09:00:00",
          summary: "Aozora logo review (internal)",
          start,
          end,
          location: "Studio 2",
          organizer: raj,
          attendees: [
            [ana, "ACCEPTED"],
            [tomas, "TENTATIVE"],
          ],
          sequence,
        },
      ],
      "REQUEST",
    );
  const checkIn = vcalendar(
    [
      {
        uid: "kaltwasser-checkin@demo.trymetis.email",
        stamp: "2026-04-20T09:00:00",
        summary: "Kaltwasser check-in",
        start: "2026-04-28T14:00:00",
        end: "2026-04-28T14:30:00",
        organizer: ana,
        attendees: [
          [lena, "DECLINED"],
          [tomas, "ACCEPTED"],
        ],
        status: "CANCELLED",
        sequence: 1,
      },
    ],
    "CANCEL",
  );
  const tokyo = vcalendar(
    [
      {
        uid: "aozora-packaging-call@aozora-ceramics.jp",
        stamp: "2026-09-11T02:00:00",
        summary: "Aozora packaging call",
        start: "2026-10-15T09:00:00",
        end: "2026-10-15T10:00:00",
        timeZone: "Asia/Tokyo",
        location: "https://linkroom.app/r/aozora-packaging",
        organizer: kenji,
        attendees: [
          [ana, "NEEDS-ACTION"],
          [tomas, "NEEDS-ACTION"],
        ],
      },
    ],
    "REQUEST",
  );
  const invite = (
    key: string,
    subject: string,
    date: string,
    from: typeof raj,
    text: string,
    ics: string,
    folder: Folder = "INBOX",
  ) =>
    mail({
      key,
      from,
      to: [ana],
      subject,
      date,
      folder,
      text,
      attachments: [
        file(
          "invite.ics",
          `${MIME.ics}; charset=utf-8; method=${ics.includes("METHOD:CANCEL") ? "CANCEL" : "REQUEST"}`,
          ics,
        ),
      ],
    });
  return [
    invite(
      "meeting/1on1",
      "Invitation: Weekly 1:1 Ana / Raj @ Tuesdays 10:00 Lisbon",
      "2026-01-05T09:00",
      raj,
      "Raj invited you to a weekly 1:1, Tuesdays 10:00-10:30 Lisbon time.\nJoin: https://linkroom.app/r/ana-raj\n",
      weekly,
      "Archive",
    ),
    invite(
      "meeting/logo-review",
      "Invitation: Aozora logo review (internal) @ Wed Sep 30, 2026 14:00 UTC",
      "2026-09-01T09:00",
      raj,
      "Raj invited you to Aozora logo review (internal) on Wed Sep 30, 2026, 14:00-15:00 UTC in Studio 2.\n",
      logoReview(0, "2026-09-30T14:00:00", "2026-09-30T15:00:00"),
    ),
    invite(
      "meeting/logo-review-update",
      "Updated invitation: Aozora logo review (internal) @ Thu Oct 1, 2026 14:00 UTC",
      "2026-09-16T11:00",
      raj,
      "Raj moved Aozora logo review (internal) to Thu Oct 1, 2026, 14:00-15:00 UTC.\n",
      logoReview(1, "2026-10-01T14:00:00", "2026-10-01T15:00:00"),
    ),
    invite(
      "meeting/kaltwasser-cancel",
      "Cancelled: Kaltwasser check-in @ Tue Apr 28, 2026 14:00 UTC",
      "2026-04-27T08:30",
      ana,
      "This event has been cancelled. Lena is travelling; we will pick a new date.\n",
      checkIn,
      "Archive",
    ),
    invite(
      "meeting/tokyo",
      "Invitation: Aozora packaging call @ Thu Oct 15, 2026 09:00 JST",
      "2026-09-11T02:00",
      kenji,
      "Kenji invited you to Aozora packaging call on Thu Oct 15, 2026, 09:00-10:00 Japan time.\nJoin: https://linkroom.app/r/aozora-packaging\n",
      tokyo,
    ),
  ];
}

function reservations(): SeededMail[] {
  return [
    mail({
      key: "reservation/flight",
      from: SENDERS.northbeam,
      to: [ana],
      subject: "Your booking is confirmed: Lisbon to Tokyo, November 9",
      date: "2026-09-03T21:10",
      starred: true,
      headers: AUTO,
      html: `<html><body>
<h2>Booking reference NB7Q4K</h2>
<p>Passenger: Ana Silva</p>
<table>
<tr><td>NB 412</td><td>Lisbon (LIS) 10:25</td><td>Frankfurt (FRA) 14:20</td><td>Mon, 9 Nov 2026</td></tr>
<tr><td>NB 908</td><td>Frankfurt (FRA) 17:55</td><td>Tokyo Haneda (HND) 13:40 +1</td><td>Mon, 9 Nov 2026</td></tr>
</table>
<p>Total paid: JPY 214,600</p>
<p><a href="https://northbeamair.com/manage/NB7Q4K">Manage your booking</a></p>
</body></html>`,
    }),
    mail({
      key: "reservation/flight-change",
      from: SENDERS.northbeam,
      to: [ana],
      subject: "Schedule change for booking NB7Q4K",
      date: "2026-09-17T06:00",
      seen: false,
      headers: AUTO,
      text: `Dear Ana Silva,

Flight NB 908 from Frankfurt to Tokyo Haneda on 9 Nov 2026 now departs at 18:30
and arrives at 14:15 the next day. Your seat 14C is unchanged.

Northbeam Air`,
    }),
    mail({
      key: "reservation/hotel",
      starred: true,
      from: SENDERS.alfama,
      to: [ana],
      subject: "Confirmação da reserva n.º 58213",
      date: "2025-07-02T13:30",
      folder: "Archive",
      text: `Olá Ana,

Obrigado pela sua reserva no Hotel Alfama.

Check-in: 18 de julho de 2025, a partir das 15h00
Check-out: 20 de julho de 2025, até às 11h00
Quarto: Duplo com vista para o rio
Total: EUR 312,00 (pago)

Rua de São Miguel 24, 1100-544 Lisboa
Até breve!
Hotel Alfama`,
    }),
    mail({
      key: "reservation/tavola",
      from: SENDERS.tavola,
      to: [ana],
      subject: "Table for 5 at Taberna da Rua, Friday 13:00",
      date: "2026-06-24T10:30",
      text: `Your table is booked.

Taberna da Rua, Rua das Flores 41, Lisbon
Friday, June 26, 2026 at 13:00, 5 people, under Sam Okafor

Need to change it? Reply to this email or use the Tavola app.`,
    }),
    mail({
      key: "reservation/tavola-cancel",
      from: SENDERS.tavola,
      to: [ana],
      subject: "Your reservation at Prado was cancelled",
      date: "2025-12-17T18:05",
      folder: "Archive",
      text: `Your reservation at Prado on Friday, December 19, 2025 at 20:00 for 8 people
was cancelled as requested.`,
    }),
  ];
}

function shared(): SeededMail[] {
  const docs: [string, typeof raj, string, string, Folder][] = [
    ["2025-03-14T10:00", priya, "Kestrel lookbook copy", "doc", "Archive"],
    ["2026-04-13T16:20", tomas, "Kaltwasser sitemap", "sheet", "Archive"],
    ["2026-07-09T09:30", priya, "Saffron & Sage menu copy (AR/EN)", "doc", "INBOX"],
    ["2026-08-12T11:00", raj, "Aozora brand guidelines", "doc", "INBOX"],
  ];
  return docs.map(([date, who, title, kind, folder], i) =>
    mail({
      key: `shared/${i}`,
      from: { name: `${who.name} (via Paperstack)`, email: SENDERS.paperstack.email },
      replyTo: who,
      to: [ana],
      subject: `${who.name} shared "${title}" with you`,
      date,
      folder,
      html: `<html><body>
<p>${who.name} shared a ${kind === "doc" ? "document" : "spreadsheet"} with you.</p>
<p><strong>${title}</strong></p>
<p><a href="https://paperstack.app/${kind}/${i + 1}f7c2a">Open in Paperstack</a></p>
<p>You can edit. Paperstack, the shared workspace for teams.</p>
</body></html>`,
    }),
  );
}

function devNotifications(): SeededMail[] {
  const repo = "fernhill/website";
  const items: [string, string, string, Folder, boolean][] = [
    [
      "2025-09-03T15:12",
      `[${repo}] Build failed: main (3f2a91c)`,
      "The production build failed on main.\n\nStep: build\nError: Cannot find module './components/Hero'\nCommit: 3f2a91c Update hero section, by Tomás Ortega",
      "Archive",
      true,
    ],
    [
      "2025-09-03T15:40",
      `[${repo}] Build fixed: main (8b7d0e2)`,
      "The production build passed on main after 8b7d0e2.",
      "Archive",
      true,
    ],
    [
      "2026-04-16T10:05",
      `[${repo}] Review requested: Kaltwasser landing page (#42)`,
      "Tomás Ortega requested your review on #42 Kaltwasser landing page.\n\n+412 -38 across 14 files.",
      "Archive",
      true,
    ],
    [
      "2026-04-17T09:22",
      `[${repo}] Merged: Kaltwasser landing page (#42)`,
      "Tomás Ortega merged #42 into main.",
      "Archive",
      true,
    ],
    [
      "2026-07-22T14:48",
      `[${repo}] Build failed: main (c41e7aa)`,
      "The production build failed on main.\n\nStep: test\nError: 2 failing tests in menu-rtl.test.ts\nCommit: c41e7aa Add Arabic menu layout, by Priya Nair",
      "INBOX",
      true,
    ],
    [
      "2026-07-22T16:30",
      `[${repo}] Review requested: Arabic menu layout (#57)`,
      "Priya Nair requested your review on #57 Arabic menu layout.\n\n+268 -12 across 9 files.",
      "INBOX",
      true,
    ],
    [
      "2026-09-11T11:00",
      `[${repo}] Review requested: Aozora case study (#63)`,
      "Raj Mehta requested your review on #63 Aozora case study draft.\n\n+96 -0 across 3 files.",
      "INBOX",
      false,
    ],
    [
      "2026-09-14T09:15",
      `[${repo}] Dependabot: 4 security updates`,
      "Dependabot opened 4 pull requests with security updates for fernhill/website.",
      "INBOX",
      false,
    ],
  ];
  return items.map(([date, subject, text, folder, seen], i) =>
    mail({
      key: `dev/${i}`,
      from: SENDERS.codeyard,
      to: [ana],
      subject,
      date,
      folder,
      seen,
      headers: [
        ["List-Id", `${repo} <website.fernhill.codeyard.dev>`],
        ["X-Codeyard-Reason", subject.includes("Review") ? "review_requested" : "ci_activity"],
      ],
      text: `${text}\n\nView it on Codeyard: https://codeyard.dev/${repo}\nYou are receiving this because you watch this repository.`,
    }),
  );
}

function teamAsks(): SeededMail[] {
  return [
    mail({
      key: "ask/sam-receipts",
      from: sam,
      to: [ana],
      subject: "Receipts for September",
      date: "2026-09-16T09:40",
      seen: false,
      text: `Hi Ana, could you send me your September receipts by the 30th? The accountant
closes the quarter on October 5.

Sam`,
    }),
    mail({
      key: "ask/priya-fonts",
      from: priya,
      to: [ana],
      subject: "Arabic type licence",
      date: "2026-07-15T13:20",
      text: `The Arabic family for Saffron & Sage needs a print and web licence: EUR 420 for
both. OK to buy?

Priya`,
    }),
  ];
}

export function notices(): SeededMail[] {
  return [
    ...bank(),
    ...orders(),
    ...shipments(),
    ...bills(),
    ...subscriptions(),
    ...codes(),
    ...security(),
    ...meetings(),
    ...reservations(),
    ...shared(),
    ...devNotifications(),
    ...teamAsks(),
  ];
}
