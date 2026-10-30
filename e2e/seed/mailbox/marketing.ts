import { PEOPLE, SENDERS } from "../../lib/cast";
import { asset, MIME } from "../documents";
import { type Folder, inline, mail, type SeededMail } from "./build";

const { ana } = PEOPLE;

const STORIES = [
  [
    "Stoneware from Porto",
    "Hand-thrown mugs and bowls from Marta Lobo's studio, glazed in sea green and chalk.",
  ],
  [
    "Linen, washed and ready",
    "Aprons and table runners in oat, rust and charcoal. Machine washable, made in Guimarães.",
  ],
  ["The candle edit", "Fig leaf, cedar and black tea: three new scents poured in recycled glass."],
  [
    "Notebooks for the new year",
    "Lay-flat notebooks in dot grid and plain, with covers from offcut leather.",
  ],
  [
    "A kitchen for slow mornings",
    "Pour-over sets, enamel kettles and the oak trays our customers keep asking about.",
  ],
  [
    "Workshop: kintsugi basics",
    "Learn to repair a broken bowl with lacquer and gold. Saturdays in November, eight places each.",
  ],
  [
    "Gifts under EUR 30",
    "Small things that travel well: soap, tea towels, pocket notebooks and beeswax wraps.",
  ],
  [
    "Meet the maker: Oficina Lume",
    "A glassblowing studio in Marinha Grande, three generations at the furnace.",
  ],
] as const;

const KESTREL_UNSUBSCRIBE: [string, string][] = [
  [
    "List-Unsubscribe",
    "<mailto:unsubscribe@kestrelsupply.com?subject=unsubscribe>, <https://kestrelsupply.com/unsubscribe?u=ana>",
  ],
  ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"],
];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 16);
}

function kestrelWeekly(): SeededMail[] {
  const out: SeededMail[] = [];
  for (let i = 0, date = "2024-11-07T08:00"; date < "2026-09-20"; i++, date = addDays(date, 10)) {
    const [title, line] = STORIES[i % STORIES.length] ?? STORIES[0];
    const folder: Folder =
      date >= "2026-05-01" ? "INBOX" : i % 4 === 1 ? "Trash" : i % 4 === 3 ? "Archive" : "INBOX";
    out.push(
      mail({
        key: `kestrel/weekly/${i}`,
        from: SENDERS.kestrel,
        to: [ana],
        subject: `This week at Kestrel: ${title}`,
        date,
        folder,
        seen: date < "2026-09-01",
        headers: KESTREL_UNSUBSCRIBE,
        html: `<!doctype html>
<html><body style="font-family: Georgia, serif; max-width: 600px; margin: auto">
<img src="cid:hero-${i}@kestrelsupply.com" width="600" alt="${title}">
<h1>${title}</h1>
<p>${line}</p>
<p><a href="https://kestrelsupply.com/journal/${i}?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=weekly-${i}">Read the story</a></p>
<img src="cid:product-${i}@kestrelsupply.com" width="280" alt="From the shop">
<p><a href="https://kestrelsupply.com/shop?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=weekly-${i}">Visit the shop</a></p>
<img src="https://trk.klaviyomail.com/open?m=${4400 + i}&amp;u=ana" width="1" height="1" alt="">
<p style="font-size: 12px">Kestrel Supply Co. · Rua das Flores 112, Porto ·
<a href="https://kestrelsupply.com/unsubscribe?u=ana">Unsubscribe</a></p>
</body></html>`,
        inline: [
          inline(`hero-${i}@kestrelsupply.com`, MIME.jpg, asset("kestrel-hero.jpg")),
          inline(`product-${i}@kestrelsupply.com`, MIME.jpg, asset("kestrel-stoneware.jpg")),
        ],
      }),
    );
  }
  return out;
}

function kestrelOffers(): SeededMail[] {
  const offers: [string, string, string, string][] = [
    [
      "2024-11-28T07:00",
      "Black Friday: 20% off everything",
      "Use code FRIDAY20 at checkout until Monday.",
      "FRIDAY20",
    ],
    [
      "2025-05-09T07:00",
      "Mother's Day: free gift wrapping",
      "Every order this week ships wrapped, with a handwritten card.",
      "WRAPPED",
    ],
    [
      "2025-11-27T07:00",
      "Black Friday: 25% off stoneware",
      "Use code CLAY25 on all stoneware until December 1.",
      "CLAY25",
    ],
    [
      "2026-03-20T07:00",
      "Spring sale starts now",
      "Up to 40% off linen and last season's candles.",
      "SPRING40",
    ],
    [
      "2026-08-14T07:00",
      "15% off this weekend only",
      "Take 15% off your order with code WEEKEND15. Ends Sunday at midnight.",
      "WEEKEND15",
    ],
  ];
  return offers.map(([date, subject, line, code], i) =>
    mail({
      key: `kestrel/offer/${i}`,
      from: SENDERS.kestrel,
      to: [ana],
      subject,
      date,
      folder: date >= "2026-01-01" ? "INBOX" : "Trash",
      headers: KESTREL_UNSUBSCRIBE,
      html: `<html><body>
<h1>${subject}</h1>
<p>${line}</p>
<p style="font-size: 24px; letter-spacing: 2px"><strong>${code}</strong></p>
<p><a href="https://kestrelsupply.com/sale?utm_source=email&amp;utm_campaign=${code.toLowerCase()}">Shop the sale</a></p>
<img src="https://trk.klaviyomail.com/open?m=${5100 + i}&amp;u=ana" width="1" height="1" alt="">
</body></html>`,
    }),
  );
}

function paperstackDigest(): SeededMail[] {
  const months = ["2025-11", "2026-01", "2026-03", "2026-05", "2026-07", "2026-09"];
  return months.map((month, i) =>
    mail({
      key: `paperstack/digest/${i}`,
      from: SENDERS.paperstack,
      to: [ana],
      subject: `Your Paperstack month: ${new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      date: `${month}-02T09:00`,
      folder: month >= "2026-05" ? "INBOX" : "Archive",
      headers: [["List-Unsubscribe", "<mailto:digest-off@paperstack.app?subject=unsubscribe>"]],
      html: `<html><body>
<h2>Your month in Paperstack</h2>
<ul>
<li>${12 + i * 3} documents edited by your team</li>
<li>${4 + i} new comments waiting for you</li>
<li>Most viewed: ${["Kestrel lookbook copy", "Kaltwasser sitemap", "Kaltwasser sitemap", "Saffron & Sage menu copy (AR/EN)", "Saffron & Sage menu copy (AR/EN)", "Aozora brand guidelines"][i]}</li>
</ul>
<img src="https://pstmrk.it/open?m=${i}a91" width="1" height="1" alt="">
</body></html>`,
    }),
  );
}

function codeyardDigest(): SeededMail[] {
  const weeks = ["2026-06-01", "2026-06-29", "2026-07-27", "2026-08-24", "2026-09-07"];
  return weeks.map((day, i) =>
    mail({
      key: `codeyard/digest/${i}`,
      from: SENDERS.codeyard,
      to: [ana],
      subject: "Your weekly Codeyard digest",
      date: `${day}T06:00`,
      seen: i < 3,
      html: `<html><body>
<h2>This week in fernhill</h2>
<ul>
<li>${5 + i} pull requests merged in fernhill/website</li>
<li>${2 + (i % 3)} builds failed and were fixed</li>
<li>Trending: a faster image pipeline for static sites</li>
</ul>
<p style="font-size: 12px">You get this digest because you are a member of fernhill.
<a href="https://codeyard.dev/settings/notifications">Unsubscribe from digests</a></p>
</body></html>`,
    }),
  );
}

function productNews(): SeededMail[] {
  const linkroom: [string, string, string][] = [
    [
      "2025-02-18T15:00",
      "New in Linkroom: live captions in 12 languages",
      "Turn on captions from the call menu. Japanese, Arabic and Hindi are now included.",
    ],
    [
      "2025-09-23T15:00",
      "Linkroom rooms now remember your layout",
      "Pin a speaker or a shared screen once; your room keeps it for the next call.",
    ],
    [
      "2026-04-21T15:00",
      "Breakout rooms are here",
      "Split a call into small groups and bring everyone back with one click.",
    ],
    [
      "2026-09-08T15:00",
      "Linkroom for teams: shared recordings",
      "Recordings now land in a shared library your whole team can search.",
    ],
  ];
  const linkroomMail = linkroom.map(([date, subject, line], i) =>
    mail({
      key: `linkroom/news/${i}`,
      from: SENDERS.linkroom,
      to: [ana],
      subject,
      date,
      folder: date >= "2026-01-01" ? "INBOX" : "Archive",
      headers: [
        ["List-Unsubscribe", "<https://linkroom.app/email/unsubscribe?u=ana>"],
        ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"],
      ],
      html: `<html><body><h2>${subject}</h2><p>${line}</p>
<p><a href="https://linkroom.app/whats-new?utm_source=email&amp;utm_medium=product">See what's new</a></p>
<img src="https://track.customer.io/e/o/eyJlbWFpbF9pZCI6Imxpbmtyb29tLSR7aX0ifQ${i}" width="1" height="1" alt=""></body></html>`,
    }),
  );
  const northbeam: [string, string][] = [
    ["2025-01-22T10:00", "Fares to Tokyo from EUR 689 return"],
    ["2025-06-10T10:00", "Summer in Lisbon: city breaks from EUR 79"],
    ["2026-02-03T10:00", "Your miles are about to expire"],
    ["2026-06-16T10:00", "Fly to Osaka from Frankfurt, new route from October"],
  ];
  const northbeamMail = northbeam.map(([date, subject], i) =>
    mail({
      key: `northbeam/promo/${i}`,
      from: SENDERS.northbeam,
      to: [ana],
      subject,
      date,
      folder: i % 2 === 0 ? "Trash" : "Archive",
      headers: [["List-Unsubscribe", "<https://northbeamair.com/preferences/unsubscribe?u=ana>"]],
      html: `<html><body><h2>${subject}</h2><p>Book by the end of the month. Terms apply.</p>
<p><a href="https://northbeamair.com/deals?utm_source=email">See the deals</a></p>
<img src="https://email.northbeamair.com/o/eJwlzEEOgjAQBf${i}" width="1" height="1" alt=""></body></html>`,
    }),
  );
  const tavola: [string, string][] = [
    ["2025-04-04T17:00", "Five new tables in Lisbon this month"],
    ["2025-10-03T17:00", "Autumn menus worth booking"],
    ["2026-03-06T17:00", "Where Lisbon eats on Sundays"],
  ];
  const tavolaMail = tavola.map(([date, subject], i) =>
    mail({
      key: `tavola/news/${i}`,
      from: SENDERS.tavola,
      to: [ana],
      subject,
      date,
      folder: "Archive",
      html: `<html><body><h2>${subject}</h2><p>Hand-picked by the Tavola team.</p>
<img src="https://u7731.ct.sendgrid.net/wf/open?upn=tav${i}ola" width="1" height="1" alt=""></body></html>`,
    }),
  );
  return [...linkroomMail, ...northbeamMail, ...tavolaMail];
}

function unsubscribed(): SeededMail {
  return mail({
    key: "tavola/unsubscribed",
    from: SENDERS.tavola,
    to: [ana],
    subject: "You're unsubscribed from Tavola picks",
    date: "2026-03-07T09:12",
    folder: "Archive",
    text: `You will no longer receive Tavola picks at ana@demo.trymetis.email.
Booking confirmations will still reach you.`,
  });
}

export function marketing(): SeededMail[] {
  return [
    ...kestrelWeekly(),
    ...kestrelOffers(),
    ...paperstackDigest(),
    ...codeyardDigest(),
    ...productNews(),
    unsubscribed(),
  ];
}
