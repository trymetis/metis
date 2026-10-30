import { PEOPLE, TEAM_LIST } from "../../lib/cast";
import { asset, docx, MIME, pdfDocument, xlsx } from "../documents";
import { file, mail, reply, type SeededMail } from "./build";

const { ana, raj, tomas, priya, sam, lena, kenji, layla, mira, cy } = PEOPLE;

const TEAM_HEADERS: [string, string][] = [
  ["List-Id", "Fernhill Team <team.demo.trymetis.email>"],
  ["List-Post", "<mailto:team@demo.trymetis.email>"],
  ["Precedence", "list"],
];

const SIGNATURE = `--
Ana Silva
Design lead, Fernhill Studio
+351 912 448 210`;

function aozora(): SeededMail[] {
  const subject = "Aozora rebrand: brief and timeline";
  const brief = pdfDocument([
    [
      "Aozora Ceramics - Rebrand brief",
      "",
      "Prepared for: Fernhill Studio",
      "Audience: design-led cafes, restaurants and home cooks in Japan and Europe",
      "",
      "Goals",
      "- A wordmark that works in Latin and Japanese script",
      "- A calmer palette taken from the glazes",
      "- Packaging that survives export shipping",
    ],
    [
      "Deliverables",
      "- Wordmark and mark, three options at first review",
      "- Colour and type system",
      "- Packaging for mugs, plates and the gift box",
      "",
      "Timeline",
      "Kickoff: 2026-10-05",
      "First review: 2026-10-08 15:00 UTC",
      "Final files: 2026-11-20",
    ],
  ]);
  const first = mail({
    key: "aozora/1",
    answered: true,
    from: kenji,
    to: [ana],
    cc: [raj],
    subject,
    date: "2026-08-10T01:20",
    starred: true,
    text: `Dear Ana,

Thank you for the call last week. As promised, our brief for the rebrand is attached.
We would like to see three directions for the wordmark at the first review, and we
hope to launch the new packaging before the spring trade fairs.

Please let me know if the timeline works for your team.

Best regards,
Kenji Watanabe
Brand manager, Aozora Ceramics
+81 75 342 1180`,
    attachments: [file("Aozora rebrand brief.pdf", MIME.pdf, brief)],
  });
  const second = mail({
    key: "aozora/2",
    from: ana,
    to: [kenji],
    cc: [raj],
    subject: reply(subject),
    date: "2026-08-10T08:42",
    folder: "Sent",
    inReplyTo: first,
    text: `Dear Kenji,

Thank you, the brief is very clear. The timeline works for us: kickoff on October 5
and the first review on October 8. Raj will lead the project and Tomás will join
for packaging.

One question: should the Japanese wordmark keep the current calligraphy, or are you
open to a new hand?

Best,
Ana

${SIGNATURE}`,
  });
  const third = mail({
    key: "aozora/3",
    answered: true,
    from: kenji,
    to: [ana],
    cc: [raj],
    subject: reply(subject),
    date: "2026-08-11T02:05",
    inReplyTo: second,
    text: `Dear Ana,

We are open to a new hand, as long as it stays readable at small sizes on the
bottom of a cup. Our founder would like to keep the colour blue somewhere.

Kenji`,
  });
  const fourth = mail({
    key: "aozora/4",
    from: raj,
    to: [kenji, ana],
    subject: reply(subject),
    date: "2026-08-11T09:30",
    inReplyTo: third,
    text: `Thanks Kenji, noted on the blue. We will bring three options to the first review.

Raj`,
  });
  const renamed = "Aozora rebrand: logo shortlist (was: brief and timeline)";
  const fifth = mail({
    key: "aozora/5",
    from: ana,
    to: [raj],
    cc: [tomas],
    subject: renamed,
    date: "2026-09-02T16:10",
    folder: "Sent",
    inReplyTo: fourth,
    text: `Raj, Tomás,

Renaming the thread now that we are past the brief. Attached are the three
directions I would put on the shortlist. The mark on the right is the one I
would push.

Ana`,
    attachments: [
      file("logo-options.png", MIME.png, asset("logo-options.png")),
      file("logo-mark.png", MIME.png, asset("logo-mark.png")),
    ],
  });
  const sixth = mail({
    key: "aozora/6",
    from: tomas,
    to: [ana],
    cc: [raj],
    subject: reply(renamed),
    date: "2026-09-02T17:45",
    inReplyTo: fifth,
    text: `Love the mark. The serif option fights the glaze photos though; I would drop it
for the packaging tests.

Tomás`,
  });
  const seventh = mail({
    key: "aozora/7",
    from: raj,
    to: [ana, tomas],
    subject: reply(renamed),
    date: "2026-09-03T08:05",
    inReplyTo: sixth,
    text: `Agreed with Tomás. Ana, can you send Kenji the two remaining options before
Friday so they can share them internally?

Raj`,
  });
  const eighth = mail({
    key: "aozora/8",
    from: ana,
    to: [kenji],
    cc: [raj, tomas],
    subject: reply(renamed),
    date: "2026-09-04T10:20",
    folder: "Sent",
    inReplyTo: seventh,
    text: `Dear Kenji,

Ahead of the review, here are the two directions we are taking forward. We will
show them on cups and the gift box on October 8.

Best,
Ana

${SIGNATURE}`,
    attachments: [file("logo-mark.png", MIME.png, asset("logo-mark.png"))],
  });
  const ooo = mail({
    key: "aozora/ooo",
    from: kenji,
    to: [ana],
    subject: `Automatic reply: ${reply(renamed)}`,
    date: "2026-09-04T10:21",
    inReplyTo: eighth,
    headers: [["Auto-Submitted", "auto-replied"]],
    text: `Thank you for your message. I am out of the office until September 9 for the
Kyoto craft fair, with limited access to email. For urgent matters please contact
info@aozora-ceramics.jp.

Kenji Watanabe`,
  });
  const japanese = mail({
    key: "aozora/ja",
    from: kenji,
    to: [ana],
    cc: [raj],
    subject: "新ブランド案のご確認について",
    date: "2026-09-10T03:30",
    seen: false,
    inReplyTo: eighth,
    text: `Ana様

いつもお世話になっております。青空陶器の渡辺です。
ロゴ案を社内で共有いたしました。創業者もマークの案をとても気に入っております。

10月8日のレビューでは、マグカップとギフトボックスでの見え方を拝見できれば幸いです。
価格については、見積書（JPY 1,850,000）の内容で問題ございません。

引き続きよろしくお願いいたします。

渡辺 健二
青空陶器 ブランドマネージャー`,
  });
  return [first, second, third, fourth, fifth, sixth, seventh, eighth, ooo, japanese];
}

function kaltwasser(): SeededMail[] {
  const subject = "Angebot für die neue Website";
  const offer = docx([
    "Fernhill Studio - Angebot 2026",
    "Kunde: Kaltwasser GmbH, Hamburg",
    "Leistungen: Konzept, Design und Umsetzung der neuen Website",
    "Zeitraum: 13.04.2026 bis 26.06.2026",
    "Preis: EUR 24.800,00 zzgl. MwSt.",
    "Zahlungsziel: 30 Tage nach Rechnungsstellung",
  ]);
  const first = mail({
    key: "kaltwasser/1",
    answered: true,
    from: lena,
    to: [ana],
    subject,
    date: "2026-03-02T09:12",
    folder: "Archive",
    text: `Hallo Ana,

vielen Dank für das nette Gespräch am Freitag. Wie besprochen möchten wir unsere
Website bis Ende Juni erneuern. Könnt ihr uns bis zum 13.03.2026 ein Angebot schicken?

Viele Grüße
Lena Hoffmann
Marketingleitung, Kaltwasser GmbH
Tel. +49 40 3198 2270`,
  });
  const second = mail({
    key: "kaltwasser/2",
    from: ana,
    to: [lena],
    subject: reply(subject),
    date: "2026-03-11T15:40",
    folder: "Sent",
    inReplyTo: first,
    text: `Hallo Lena,

anbei unser Angebot für die neue Website. Wir können am 13.04.2026 starten.
Melde dich gern, wenn ihr Fragen habt.

Viele Grüße
Ana

${SIGNATURE}`,
    attachments: [file("Angebot 2026.docx", MIME.docx, offer)],
  });
  const third = mail({
    key: "kaltwasser/3",
    answered: true,
    from: lena,
    to: [ana],
    subject: `AW: ${subject}`,
    date: "2026-03-16T08:55",
    folder: "Archive",
    inReplyTo: second,
    text: `Hallo Ana,

das Angebot passt. Wir geben grünes Licht für den Start am 13.04.

Viele Grüße
Lena`,
  });
  const invoice = pdfDocument([
    [
      "Fernhill Studio - Rechnung FS-2026-031",
      "Kaltwasser GmbH, Speicherstadt 14, 20457 Hamburg",
      "Datum: 30.06.2026",
      "Website Konzept, Design und Umsetzung: EUR 24.800,00",
      "MwSt. 19%: EUR 4.712,00",
      "Gesamt: EUR 29.512,00",
      "Zahlbar bis: 30.07.2026",
    ],
  ]);
  const fourth = mail({
    key: "kaltwasser/4",
    from: ana,
    to: [lena],
    subject: "Rechnung FS-2026-031",
    date: "2026-06-30T10:00",
    folder: "Sent",
    text: `Hallo Lena,

anbei die Rechnung für die neue Website. Vielen Dank für die tolle Zusammenarbeit!

Viele Grüße
Ana`,
    attachments: [file("Rechnung FS-2026-031.pdf", MIME.pdf, invoice)],
  });
  const fifth = mail({
    key: "kaltwasser/5",
    starred: true,
    from: lena,
    to: [ana],
    subject: "AW: Rechnung FS-2026-031",
    date: "2026-07-21T13:05",
    inReplyTo: fourth,
    text: `Hallo Ana,

die Zahlung über EUR 29.512,00 ist heute angewiesen worden. Das Geld sollte in
zwei bis drei Werktagen bei euch sein.

Viele Grüße
Lena`,
  });
  const feedback = mail({
    key: "kaltwasser/feedback",
    from: lena,
    to: [raj],
    subject: "Feedback zur Startseite",
    date: "2026-05-18T11:30",
    folder: "Archive",
    text: `Hallo Raj,

die neue Startseite gefällt uns sehr. Zwei Punkte noch:
1. Das Kontaktformular sollte auch auf Englisch verfügbar sein.
2. Die Bilder im Kopfbereich laden auf dem Handy recht langsam.

Viele Grüße
Lena`,
  });
  const forwarded = mail({
    key: "kaltwasser/fwd-1",
    from: raj,
    to: [ana],
    cc: [tomas],
    subject: "Fwd: Feedback zur Startseite",
    date: "2026-05-18T12:02",
    inReplyTo: feedback,
    folder: "Archive",
    text: `Ana, can you look at point 2? Tomás, point 1 is yours.

---------- Forwarded message ---------
From: Lena Hoffmann <lena@kaltwasser-gmbh.de>
Date: Mon, 18 May 2026 11:30
Subject: Feedback zur Startseite
To: Raj Mehta <raj@demo.trymetis.email>

Hallo Raj,

die neue Startseite gefällt uns sehr. Zwei Punkte noch:
1. Das Kontaktformular sollte auch auf Englisch verfügbar sein.
2. Die Bilder im Kopfbereich laden auf dem Handy recht langsam.

Viele Grüße
Lena`,
  });
  const forwardedAgain = mail({
    key: "kaltwasser/fwd-2",
    from: ana,
    to: [priya],
    subject: "Fwd: Fwd: Feedback zur Startseite",
    date: "2026-05-18T14:20",
    folder: "Sent",
    inReplyTo: forwarded,
    text: `Priya, could you compress the header images on the Kaltwasser site? Below is
their feedback; point 2 is the one for you.

---------- Forwarded message ---------
From: Raj Mehta <raj@demo.trymetis.email>
Date: Mon, 18 May 2026 12:02
Subject: Fwd: Feedback zur Startseite
To: Ana Silva <ana@demo.trymetis.email>

Ana, can you look at point 2? Tomás, point 1 is yours.`,
  });
  return [first, second, third, fourth, fifth, feedback, forwarded, forwardedAgain];
}

function saffron(): SeededMail[] {
  const subject = "تصميم القائمة الجديدة / New menu design";
  const first = mail({
    key: "saffron/1",
    answered: true,
    from: layla,
    to: [ana],
    subject,
    date: "2026-07-06T07:15",
    text: `مرحباً آنا،

شكراً على العرض. نود أن نبدأ بتصميم القائمة الجديدة للمطعم في دبي.
أرفقت صورة لطبق المسخّن كما يُقدَّم الآن، ونريد أن تعكس القائمة هذا الدفء.

Hi Ana, a short English version: we would like to start with the new menu for the
Dubai restaurant. The photo shows our musakhan as served today.

مع التحية،
ليلى حداد
Saffron & Sage`,
    attachments: [file("musakhan.jpg", MIME.jpg, asset("saffron-dish.jpg"))],
  });
  const quote = pdfDocument([
    [
      "Fernhill Studio - Quote FS-Q-2026-044",
      "Client: Saffron & Sage, Dubai",
      "Menu redesign, Arabic and English, print and web: AED 18,500",
      "Photography art direction (one day): AED 4,200",
      "Total: AED 22,700",
      "Valid until: 2026-08-06",
    ],
  ]);
  const second = mail({
    key: "saffron/2",
    from: ana,
    to: [layla],
    cc: [priya],
    subject: reply(subject),
    date: "2026-07-06T11:30",
    folder: "Sent",
    inReplyTo: first,
    text: `Hi Layla,

What a beautiful dish. Our quote for the menu redesign is attached. Priya will set
the Arabic typography with you, right to left first and English second.

Best,
Ana

${SIGNATURE}`,
    attachments: [file("Quote FS-Q-2026-044.pdf", MIME.pdf, quote)],
  });
  const third = mail({
    key: "saffron/3",
    from: layla,
    to: [ana],
    cc: [priya],
    subject: `رد: ${subject}`,
    date: "2026-07-08T06:50",
    inReplyTo: second,
    starred: true,
    text: `مرحباً آنا وبريا،

نوافق على العرض. يمكننا جدولة يوم التصوير في الأسبوع الأول من أغسطس.

We accept the quote. The photo day can be in the first week of August.

ليلى`,
  });
  const fourth = mail({
    key: "saffron/4",
    from: priya,
    to: [layla],
    cc: [ana],
    subject: `رد: ${subject}`,
    date: "2026-07-08T09:10",
    inReplyTo: third,
    text: `Thank you Layla! I will send the first type pairings on Friday.

Priya`,
  });
  return [first, second, third, fourth];
}

function weeklyNotes(): SeededMail[] {
  const weeks: [string, string, string][] = [
    [
      "2025-01-13T08:30",
      "Archive",
      "Budget 2025 is approved. New Ledgerline seats for Sam and Priya.",
    ],
    [
      "2025-03-10T08:30",
      "Archive",
      "Kestrel shoot moved to March 21. Print vendor files are due on Wednesday.",
    ],
    [
      "2025-05-12T08:30",
      "Archive",
      "Holidays: please add yours to the Personal calendar by the end of May.",
    ],
    ["2025-07-14T08:30", "Archive", "Summer hours start today: Fridays end at 14:00."],
    [
      "2025-09-15T08:30",
      "Archive",
      "Welcome back. Offsite planning starts this week; send venue ideas to Sam.",
    ],
    [
      "2025-11-10T08:30",
      "Archive",
      "Kaltwasser pitch went well. Year-end closing dates are in Sam's email.",
    ],
    [
      "2026-02-09T08:30",
      "INBOX",
      "Kaltwasser kickoff in April. Tomás leads development, Priya type and images.",
    ],
    [
      "2026-05-11T08:30",
      "INBOX",
      "Kaltwasser homepage feedback is in. Saffron & Sage asked for a quote.",
    ],
    [
      "2026-07-13T08:30",
      "INBOX",
      "Saffron & Sage photo day is booked. Aozora brief arrives in August.",
    ],
    [
      "2026-09-14T08:30",
      "INBOX",
      "Aozora kickoff on October 5, first review October 8 at 15:00 UTC.",
    ],
  ];
  return weeks.map(([date, folder, line], i) =>
    mail({
      key: `weekly/${i}`,
      from: priya,
      to: [TEAM_LIST],
      subject: `[Fernhill Team] Studio weekly, ${new Date(`${date}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`,
      date,
      folder: folder === "INBOX" ? "INBOX" : "Archive",
      seen: i !== weeks.length - 1,
      headers: TEAM_HEADERS,
      text: `Morning all,

Notes from Monday's weekly:

- ${line}
- Standup stays at 09:00 UTC on Linkroom.
- Please keep client files under Clients/ on the shared drive.

Priya`,
    }),
  );
}

function offsite(): SeededMail[] {
  const subject = "Offsite in Sintra, March 23-25";
  const first = mail({
    key: "offsite/1",
    from: sam,
    to: [TEAM_LIST],
    subject: `[Fernhill Team] ${subject}`,
    date: "2026-02-16T10:00",
    folder: "Archive",
    headers: TEAM_HEADERS,
    text: `Hi team,

The offsite is booked: Quinta da Ribeira in Sintra, March 23 to 25. Train from
Rossio at 09:11 on Monday. Rooms are shared in pairs; tell me if you have a
preference by Friday.

Sam`,
  });
  const second = mail({
    key: "offsite/2",
    from: ana,
    to: [TEAM_LIST],
    subject: `Re: [Fernhill Team] ${subject}`,
    date: "2026-02-16T10:40",
    folder: "Sent",
    inReplyTo: first,
    headers: TEAM_HEADERS,
    text: `Thanks Sam! I can run a session on the Kaltwasser kickoff on Tuesday morning.

Ana`,
  });
  const third = mail({
    key: "offsite/3",
    from: tomas,
    to: [TEAM_LIST],
    subject: `Re: [Fernhill Team] ${subject}`,
    date: "2026-02-16T11:15",
    folder: "Archive",
    inReplyTo: second,
    headers: TEAM_HEADERS,
    text: `Count me in. I will bring the projector.

Tomás`,
  });
  const photos = mail({
    key: "offsite/photos",
    from: tomas,
    to: [TEAM_LIST],
    subject: "[Fernhill Team] Photos from the offsite",
    date: "2026-03-27T17:20",
    starred: true,
    headers: TEAM_HEADERS,
    text: `A few favourites from Sintra. The rest are on the shared drive under Team/Offsite 2026.

Tomás`,
    attachments: [
      file("terrace.jpg", MIME.jpg, asset("offsite-terrace.jpg")),
      file("workshop.jpg", MIME.jpg, asset("offsite-workshop.jpg")),
    ],
  });
  return [first, second, third, photos];
}

function lunch(): SeededMail[] {
  const subject = "Lunch on Friday?";
  const first = mail({
    key: "lunch/1",
    answered: true,
    from: sam,
    to: [ana, priya],
    cc: [tomas, raj],
    subject,
    date: "2026-06-24T10:05",
    text: `Taberna da Rua on Friday at 13:00? I can book for five.

Sam`,
  });
  const second = mail({
    key: "lunch/2",
    from: ana,
    to: [sam],
    cc: [priya, tomas, raj],
    subject: reply(subject),
    date: "2026-06-24T10:20",
    folder: "Sent",
    inReplyTo: first,
    text: `Yes please!

Ana`,
  });
  const third = mail({
    key: "lunch/3",
    from: raj,
    to: [sam],
    cc: [ana, priya, tomas],
    subject: reply(subject),
    date: "2026-06-24T11:02",
    inReplyTo: second,
    text: `I will join after my 13:00 call, around 13:30.

Raj`,
  });
  return [first, second, third];
}

function venue(): SeededMail[] {
  const subject = "Venue for the Aozora launch";
  const first = mail({
    key: "venue/1",
    from: ana,
    to: [mira],
    bcc: [raj],
    subject,
    date: "2026-09-08T14:00",
    folder: "Sent",
    text: `Hi Mira,

We are planning a small launch for a client's new brand in late November, about
60 guests with a ceramics display. Is Harbour Hall free on November 26 or 27?

Best,
Ana

${SIGNATURE}`,
  });
  const second = mail({
    key: "venue/2",
    starred: true,
    from: mira,
    to: [ana],
    subject: reply(subject),
    date: "2026-09-09T09:45",
    inReplyTo: first,
    text: `Hi Ana,

November 26 is free. The terrace room holds 80 standing and we can provide plinths
for the display. I have put a hold on it and will send the terms this week.

Mira Costa
Events, Harbour Hall`,
  });
  return [first, second];
}

function introductions(): SeededMail[] {
  return [
    mail({
      key: "intro/lena",
      from: raj,
      to: [ana, lena],
      subject: "Introducing Lena Hoffmann (Kaltwasser GmbH)",
      date: "2025-11-04T09:00",
      folder: "Archive",
      text: `Ana, meet Lena Hoffmann, head of marketing at Kaltwasser GmbH in Hamburg. They
are looking for a studio to redo their website next spring.

Lena, Ana leads design at Fernhill and would run the project.

Lena Hoffmann
Marketingleitung, Kaltwasser GmbH
lena@kaltwasser-gmbh.de · +49 40 3198 2270
Speicherstadt 14, 20457 Hamburg

Raj`,
    }),
    mail({
      key: "intro/layla",
      starred: true,
      from: priya,
      to: [ana],
      subject: "Introducing Layla Haddad from Saffron & Sage",
      date: "2026-06-29T12:30",
      text: `Ana, Layla Haddad runs Saffron & Sage, the restaurant group I mentioned. They want
a new menu for Dubai and asked for a quote.

Layla Haddad
Founder, Saffron & Sage
layla@saffronandsage.ae · +971 4 388 1940
Alserkal Avenue, Unit 41, Dubai

Priya`,
    }),
  ];
}

function yearEnd(): SeededMail[] {
  const closing = mail({
    key: "yearend/closing",
    from: sam,
    to: [TEAM_LIST],
    subject: "[Fernhill Team] Holiday closing dates",
    date: "2024-12-02T09:00",
    folder: "Archive",
    headers: TEAM_HEADERS,
    text: `Hi all, the studio is closed from December 24 to January 1. Please put your
days off in the Personal calendar.

Sam`,
  });
  const budgetSheet = xlsx("Budget 2025", [
    ["Category", "Q1", "Q2", "Q3", "Q4", "Total"],
    ["Software", 1200, 1200, 1250, 1250, 4900],
    ["Hardware", 3400, 0, 800, 0, 4200],
    ["Travel", 900, 2400, 600, 1800, 5700],
    ["Freelancers", 6000, 8000, 4000, 7000, 25000],
    ["Studio rent", 5400, 5400, 5400, 5400, 21600],
  ]);
  const budget = mail({
    key: "yearend/budget",
    from: tomas,
    to: [ana],
    cc: [sam],
    subject: "Budget 2025",
    date: "2025-01-08T15:30",
    folder: "Archive",
    text: `Ana, the budget sheet for 2025 is attached, in EUR. Freelancers is the line to
discuss; the rest is the same as this year.

Tomás`,
    attachments: [file("Budget 2025.xlsx", MIME.xlsx, budgetSheet)],
  });
  const answer = mail({
    key: "yearend/budget-reply",
    from: ana,
    to: [tomas],
    cc: [sam],
    subject: reply("Budget 2025"),
    date: "2025-01-08T17:10",
    folder: "Sent",
    inReplyTo: budget,
    text: `Looks right. Let's keep freelancers at EUR 25,000 and review in July.

Ana`,
  });
  return [closing, budget, answer];
}

function sentNotes(): SeededMail[] {
  const notes: [string, string, (typeof PEOPLE)[keyof typeof PEOPLE][], string][] = [
    [
      "2024-11-18T09:20",
      "Out on Friday",
      [raj, sam],
      "I will be out on Friday for a dentist appointment. Back on Monday.",
    ],
    [
      "2025-02-03T16:00",
      "Portfolio update",
      [tomas],
      "Can you add the Kestrel lookbook to the portfolio page this week?",
    ],
    [
      "2025-04-22T11:45",
      "New laptop",
      [sam],
      "My laptop battery is gone. Could we order a replacement before the Kestrel shoot?",
    ],
    [
      "2025-06-30T10:10",
      "Kestrel shoot invoices",
      [sam],
      "The photographer's invoice is in Finance/2025 on the drive. Please pay by Friday.",
    ],
    [
      "2025-08-18T08:50",
      "Back from holidays",
      [raj],
      "Back today. Anything urgent from the last two weeks?",
    ],
    [
      "2025-10-06T13:15",
      "Type licences",
      [priya],
      "Do we have a web licence for the Kaltwasser pitch font, or should I buy one?",
    ],
    [
      "2025-12-15T17:30",
      "Year in review slides",
      [raj, priya, tomas, sam],
      "Draft slides for Friday's year in review are in Team/ on the drive.",
    ],
    [
      "2026-01-19T09:05",
      "Kaltwasser pitch follow-up",
      [raj],
      "Lena said they will decide by mid-February. I will follow up on the 16th.",
    ],
    [
      "2026-04-14T18:20",
      "Kaltwasser kickoff notes",
      [tomas, priya],
      "Notes from today's kickoff are in Clients/Kaltwasser GmbH. Next check-in on April 28.",
    ],
    [
      "2026-06-02T08:30",
      "Swiftpost return",
      [sam],
      "The lamp from Brightloom arrived broken. I have booked a Swiftpost return for tomorrow.",
    ],
    [
      "2026-08-21T15:00",
      "Holiday handover",
      [raj, tomas],
      "I am off from August 24 to 28. Aozora questions go to Raj, packaging to Tomás.",
    ],
    [
      "2026-09-15T10:30",
      "Moodboard for Aozora",
      [raj],
      "The moodboard is in Clients/Aozora Ceramics/Rebrand. I will send it to Kenji on Friday.",
    ],
    [
      "2024-12-10T11:00",
      "Kestrel shoot dates",
      [priya, tomas],
      "Kestrel would like the spring shoot in the second half of March. Can you both hold March 18 to 21?",
    ],
    [
      "2025-01-27T09:40",
      "Studio cleaning",
      [sam],
      "The cleaners can come on Thursdays instead of Mondays from February. Fine by me.",
    ],
    [
      "2025-03-24T17:05",
      "Shoot wrap-up",
      [priya, tomas, raj],
      "Great shoot, everyone. Selects are due on Friday; Priya, can you send the first 40?",
    ],
    [
      "2025-05-19T08:15",
      "Kestrel lookbook print run",
      [priya],
      "Let's go with 600 copies on the uncoated stock. I approved the proof this morning.",
    ],
    [
      "2025-07-07T12:00",
      "Summer hours",
      [sam],
      "Can you add the Friday 14:00 finish to the team calendar?",
    ],
    [
      "2025-09-29T10:25",
      "Offsite venue ideas",
      [sam],
      "Two ideas for the offsite: Sintra or Comporta. Sintra is easier by train.",
    ],
    [
      "2025-11-24T16:45",
      "Kaltwasser pitch deck",
      [raj, priya],
      "Pitch deck v3 is in Clients/Kaltwasser GmbH. Raj, please check the pricing slide.",
    ],
    [
      "2026-02-23T14:10",
      "Kaltwasser kickoff agenda",
      [lena],
      "Hallo Lena, anbei die Agenda für den Kickoff am 13.04. Bis bald! Ana",
    ],
    [
      "2026-03-30T09:00",
      "Back from Sintra",
      [raj, priya, tomas, sam],
      "Thank you for a lovely offsite. Notes from the strategy session are in Team/.",
    ],
    [
      "2026-05-26T15:35",
      "Kaltwasser go-live checklist",
      [tomas],
      "Checklist for the June 26 go-live is in Clients/Kaltwasser GmbH. Please tick off what is done.",
    ],
    [
      "2026-06-26T18:00",
      "Kaltwasser is live",
      [raj, priya, tomas, sam],
      "The new Kaltwasser site is live. Thank you all, drinks on me next week.",
    ],
    [
      "2026-07-10T10:40",
      "Photo day details",
      [layla],
      "Hi Layla, the photographer arrives at 08:00 on August 4. Please have six dishes ready by 10:00.",
    ],
    [
      "2026-08-05T19:20",
      "Photo day selects",
      [layla, priya],
      "Thank you for a great day. The first 30 selects are in Paperstack for your review.",
    ],
    [
      "2026-08-28T17:50",
      "Back on Monday",
      [raj, tomas],
      "Back on Monday. Thanks for covering the Aozora questions.",
    ],
    [
      "2026-09-09T12:10",
      "Harbour Hall hold",
      [raj],
      "Mira put a hold on November 26 for the Aozora launch. Terms coming this week.",
    ],
    [
      "2026-09-18T11:30",
      "Receipts sent",
      [sam],
      "My September receipts are in Finance/2026 on the drive.",
    ],
  ];
  return notes.map(([date, subject, to, text], i) =>
    mail({
      key: `sent/${i}`,
      from: ana,
      to,
      subject,
      date,
      folder: "Sent",
      text: `${text}\n\nAna`,
    }),
  );
}

function drafts(): SeededMail[] {
  const budgetSheet = xlsx("Budget 2026", [
    ["Category", "Planned", "Spent"],
    ["Software", 5200, 3900],
    ["Travel", 6400, 5100],
    ["Freelancers", 28000, 19500],
  ]);
  return [
    mail({
      key: "draft/layla",
      from: ana,
      to: [layla],
      subject: "رد: تصميم القائمة الجديدة / New menu design",
      date: "2026-09-18T16:40",
      folder: "Drafts",
      text: `Hi Layla,

The first proofs of the menu are ready. Before I send them, could you confirm the
final prices for the`,
    }),
    mail({
      key: "draft/budget",
      from: ana,
      to: [sam],
      subject: "Fwd: Budget 2026 so far",
      date: "2026-09-17T12:00",
      folder: "Drafts",
      text: "Sam, here is where we are against the plan. Travel is close to the limit.",
      attachments: [file("Budget 2026.xlsx", MIME.xlsx, budgetSheet)],
    }),
    mail({
      key: "draft/mira",
      from: ana,
      to: [mira],
      subject: "Terms for November 26",
      date: "2026-09-19T09:15",
      folder: "Drafts",
      text: "Hi Mira,\n\nThanks for holding the date. A few questions on the terms:\n\n1. ",
    }),
    mail({
      key: "draft/lena",
      from: ana,
      to: [lena],
      subject: "Wartung der Website",
      date: "2026-09-16T14:30",
      folder: "Drafts",
      text: "Hallo Lena,\n\nwie besprochen schicke ich dir unser Angebot für die Wartung ab Oktober",
    }),
    mail({
      key: "draft/team",
      from: ana,
      to: [TEAM_LIST],
      subject: "Studio tidy-up on Friday",
      date: "2026-09-20T18:00",
      folder: "Drafts",
      text: "Hi all, on Friday afternoon let's",
    }),
    mail({
      key: "draft/kenji",
      from: ana,
      to: [kenji],
      cc: [raj],
      subject: "Packaging samples",
      date: "2026-09-12T08:00",
      folder: "Drafts",
      text: "Dear Kenji,\n\nCould you send us two mugs and one plate in each glaze for the packaging tests?",
    }),
  ];
}

function followUps(): SeededMail[] {
  const items: [string, (typeof PEOPLE)[keyof typeof PEOPLE], string, string, boolean][] = [
    [
      "2026-09-17T08:20",
      tomas,
      "Packaging dielines",
      "Kenji sent the box dielines. I put them next to the brief and started on the gift box.",
      true,
    ],
    [
      "2026-09-18T14:05",
      priya,
      "Arabic proofs",
      "Layla approved the Arabic proofs with two small changes. English version next.",
      false,
    ],
    [
      "2026-09-19T10:45",
      raj,
      "Aozora review agenda",
      "Draft agenda for October 8: 10 minutes context, 25 minutes directions, 10 minutes next steps. Add anything?",
      false,
    ],
    [
      "2026-09-20T09:30",
      sam,
      "Studio keys",
      "New keys for the front door are on your desk. The old ones stop working on Monday.",
      false,
    ],
    [
      "2026-09-12T16:00",
      cy,
      "Hello from the Porto office",
      "Hi Ana, I joined the Porto office this week. Raj suggested we meet when you are next in town.",
      true,
    ],
    [
      "2026-08-31T09:05",
      lena,
      "Wartung ab Oktober",
      "Hallo Ana, könnt ihr uns ein Angebot für die Wartung der Website ab Oktober schicken? Viele Grüße, Lena",
      true,
    ],
    [
      "2026-08-20T07:40",
      layla,
      "Menu print run",
      "Hi Ana, the printer needs the final PDF by September 25 for 400 menus. Layla",
      true,
    ],
    [
      "2026-07-29T13:15",
      raj,
      "Aozora proposal signed",
      "Kenji signed the proposal. Kickoff is October 5. I will set up the folder on the shared drive.",
      true,
    ],
    [
      "2025-02-26T11:20",
      priya,
      "Kestrel shoot shot list",
      "Shot list for the Kestrel shoot is in Clients/. 42 shots over two days, stoneware first.",
      true,
    ],
    [
      "2025-06-05T15:00",
      tomas,
      "Website hosting renewal",
      "Our hosting renews on June 20 for EUR 240 a year. Same plan as last year?",
      true,
    ],
    [
      "2025-08-29T10:10",
      raj,
      "Kaltwasser pitch",
      "Lena wants a pitch in November. I will draft the deck; can you take the case studies?",
      true,
    ],
    [
      "2025-12-22T09:00",
      sam,
      "Last day before the holidays",
      "The studio closes at 15:00 today. Happy holidays, everyone!",
      true,
    ],
    [
      "2026-01-12T08:45",
      priya,
      "Type licences for 2026",
      "I renewed the Arabic and Japanese type licences for 2026. Invoices are in Finance/.",
      true,
    ],
  ];
  const starred = new Set(["Aozora proposal signed", "Kaltwasser pitch"]);
  return items.map(([date, from, subject, text, seen], i) =>
    mail({
      key: `followup/${i}`,
      from,
      to: [ana],
      subject,
      date,
      folder: date < "2026-01-01" ? "Archive" : "INBOX",
      seen,
      starred: starred.has(subject),
      text,
    }),
  );
}

export function threads(): SeededMail[] {
  return [
    ...aozora(),
    ...kaltwasser(),
    ...saffron(),
    ...weeklyNotes(),
    ...offsite(),
    ...lunch(),
    ...venue(),
    ...introductions(),
    ...yearEnd(),
    ...sentNotes(),
    ...followUps(),
    ...drafts(),
  ];
}
