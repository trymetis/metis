import { PEOPLE, SENDERS, SUBJECTS } from "../../lib/cast";
import { type EventSpec, vcalendar } from "../ics";
import { type SeededMail, file, mail } from "./build";

const { ana, raj, tomas } = PEOPLE;

export const REBRAND_REVIEW: EventSpec = {
  uid: "rebrand-review@demo.trymetis.email",
  stamp: "2026-09-24T12:00:00",
  summary: "Rebrand review",
  start: "2026-10-08T15:00:00",
  end: "2026-10-08T15:45:00",
  location: "https://linkroom.app/r/rebrand-review",
  organizer: raj,
  attendees: [
    [ana, "NEEDS-ACTION"],
    [tomas, "ACCEPTED"],
  ],
};

const PIXEL = "http://localhost:8099/pixel";

const NEWSLETTER = `<!doctype html>
<html>
<head>
<meta http-equiv="refresh" content="0;url=${PIXEL}/never/meta-refresh">
<base href="${PIXEL}/never/base/">
<link rel="stylesheet" href="${PIXEL}/never/link.css">
<style>
@import url(${PIXEL}/never/import.css);
@font-face { font-family: Kestrel; src: url(${PIXEL}/never/font.woff2); }
:root { --hero: url(${PIXEL}/image/var); }
.banner { background-image: url('${PIXEL}/image/style-block'); height: 40px; }
.badge::before { content: url(${PIXEL}/image/content); }
.set { background-image: image-set("${PIXEL}/image/image-set" 1x); height: 40px; }
.hero { background-image: var(--hero); height: 40px; }
.spy { background-image: url(${PIXEL}/never/known/wf/open?upn=css); }
h1 { font-family: Kestrel, Georgia, serif; }
@media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
</style>
</head>
<body>
<h1>This week at the shop</h1>
<p>New in: hand-thrown stoneware from our Porto studio, linen aprons in three colours and the autumn candle collection.</p>
<img src="${PIXEL}/image/img" width="300" height="80" alt="Stoneware mugs on a shelf">
<img srcset="${PIXEL}/image/srcset 1x" width="300" alt="Linen aprons">
<picture><source srcset="${PIXEL}/image/picture"><img src="${PIXEL}/image/picture-img" width="300" alt="Autumn candles"></picture>
<table background="${PIXEL}/image/background-attr" width="300"><tr><td>Free shipping on orders over EUR 60</td></tr></table>
<div style="background-image:url(${PIXEL}/image/style-attr);height:40px">Workshop dates for November</div>
<div class="banner">Members save 10% this week</div>
<div class="badge">Back in stock</div>
<div class="set">Gift cards</div>
<div class="hero">Our autumn lookbook</div>
<svg width="300" height="60"><image href="${PIXEL}/image/svg-image" width="300" height="60"/></svg>
<svg width="300" height="20"><rect width="300" height="20" fill="url(${PIXEL}/image/svg-fill#p)"/><rect width="10" height="10" fill="url(${PIXEL}/never/svg-unclosed"/></svg>
<svg width="300" height="20"><a><animate attributeName="href" by="${PIXEL}/never/animate-by"/><text y="15">Shop the edit</text></a></svg>
<video poster="${PIXEL}/never/poster.png" width="300"><source src="${PIXEL}/never/video.mp4"></video>
<audio src="${PIXEL}/never/audio.mp3"></audio>
<form action="${PIXEL}/never/form"><input type="image" src="${PIXEL}/never/input-image"></form>
<iframe srcdoc="&lt;img src=${PIXEL}/never/iframe-srcdoc&gt;"></iframe>
<object data="${PIXEL}/never/object"></object>
<embed src="${PIXEL}/never/embed">
<img src="${PIXEL}/never/known/wf/open?upn=img" alt="">
<img src="${PIXEL}/never/known/open.gif" alt="">
<img src="${PIXEL}/never/heuristic/1x1.gif" width="1" height="1" alt="">
<img src="${PIXEL}/never/heuristic/hidden.gif" style="display:none" alt="">
<p>
<a href="https://kestrelsupply.com/stoneware?utm_source=newsletter&amp;utm_campaign=week39&amp;id=7">Shop the stoneware</a><br>
<a href="https://www.google.com/url?q=https%3A%2F%2Fkestrelsupply.com%2Fworkshops&amp;sa=D">Book a workshop</a><br>
<a href="https://u4821.ct.sendgrid.net/ls/click?upn=k3str3l">See the lookbook</a><br>
<a href="#bottom">Jump to the bottom</a>
</p>
<p id="bottom">Kestrel Supply Co. · Rua das Flores 112, Porto · You are receiving this because you joined our mailing list.</p>
</body>
</html>
`;

export function anchors(): SeededMail[] {
  return [
    mail({
      key: "anchor/kickoff",
      from: raj,
      to: [ana],
      subject: SUBJECTS.kickoff,
      date: "2026-09-21T09:15",
      seen: false,
      text: `Hi Ana,

We agreed to start the rebrand on October 5. Can you send me the
moodboard by Friday, and confirm whether Tomás can join the first review?

Thanks,
Raj`,
    }),
    mail({
      key: "anchor/otp",
      from: SENDERS.codeyard,
      to: [ana],
      subject: SUBJECTS.otp,
      date: "2026-09-22T07:30",
      seen: false,
      headers: [["Auto-Submitted", "auto-generated"]],
      text: `Here is your Codeyard sign-in verification code: 482913

This code expires in 10 minutes. If you did not try to sign in, change your password.`,
    }),
    mail({
      key: "anchor/shipment",
      from: SENDERS.brightloom,
      to: [ana],
      subject: SUBJECTS.shipment,
      date: "2026-09-23T10:00",
      seen: false,
      html: `<html>
<head>
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "ParcelDelivery",
  "carrier": { "@type": "Organization", "name": "Swiftpost" },
  "trackingNumber": "SP4471920385PT",
  "trackingUrl": "https://swiftpost.com/track/SP4471920385PT",
  "expectedArrivalUntil": "2026-09-30T20:00:00+00:00",
  "partOfOrder": {
    "@type": "Order",
    "orderNumber": "A-42",
    "merchant": { "@type": "Organization", "name": "Brightloom" }
  },
  "itemShipped": { "@type": "Product", "name": "Walnut desk lamp" }
}
</script>
</head>
<body>
<p>Good news, your order A-42 is on its way.</p>
<p>Walnut desk lamp, shipped with Swiftpost. Expected by September 30.</p>
<p><a href="https://swiftpost.com/track/SP4471920385PT">Track your package</a></p>
</body>
</html>
`,
    }),
    mail({
      key: "anchor/invite",
      from: raj,
      to: [ana],
      subject: SUBJECTS.review,
      date: "2026-09-24T12:00",
      seen: false,
      text: `Raj invited you to Rebrand review on Thu Oct 8, 2026, 15:00-15:45 UTC.
Join: https://linkroom.app/r/rebrand-review
`,
      attachments: [
        file(
          "invite.ics",
          "text/calendar; charset=utf-8; method=REQUEST",
          vcalendar([REBRAND_REVIEW], "REQUEST"),
        ),
      ],
    }),
    mail({
      key: "anchor/bank",
      from: SENDERS.konkan,
      to: [ana],
      subject: SUBJECTS.bank,
      date: "2026-09-25T04:10",
      seen: false,
      headers: [["Auto-Submitted", "auto-generated"]],
      text: `Dear Customer, INR 1250.00 has been debited from account **4821 to
VPA chaiwala.store@konkan on 25-09-26. UPI Ref 427311009876.
Available balance: INR 48,210.55.
Not you? Call 1800 266 4821 to block your account.`,
    }),
    mail({
      key: "anchor/newsletter",
      from: SENDERS.kestrel,
      to: [ana],
      subject: SUBJECTS.newsletter,
      date: "2026-09-26T08:00",
      seen: false,
      headers: [
        [
          "List-Unsubscribe",
          "<mailto:unsubscribe@kestrelsupply.com?subject=unsubscribe>, <https://kestrelsupply.com/unsubscribe?u=ana>",
        ],
        ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"],
      ],
      html: NEWSLETTER,
    }),
  ];
}

export function anchorMessageId(subject: string): string {
  const found = anchors().find((m) => m.subject === subject);
  if (!found) throw new Error(`no seeded anchor "${subject}"`);
  return found.messageId;
}
