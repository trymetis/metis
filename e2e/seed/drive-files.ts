import { CLIENTS, REBRAND_FOLDER } from "../lib/cast";
import { asset, csv, docx, MIME, pdfDocument, pptx, xlsx } from "./documents";
import { wav, zip } from "./edge/binary";
import { randomBytes } from "./edge/rng";

export interface DriveFile {
  key: string;
  body: () => Uint8Array;
  contentType?: string;
}

const KB = 1024;
const text = (value: string) => () => new TextEncoder().encode(value);

const AOZORA = `Clients/${CLIENTS.aozora}/`;
const KALTWASSER = `Clients/${CLIENTS.kaltwasser}/`;
const SAFFRON = `Clients/${CLIENTS.saffron}/`;

const BRIEF = `# Aozora Ceramics rebrand

Prepared for Fernhill Studio by Kenji Watanabe, brand manager at Aozora Ceramics.

## Audience

Design-led cafes, restaurants and home cooks in Japan and Europe.

## Deliverables

- Wordmark and mark, three options at the first review
- Colour and type system
- Packaging for mugs, plates and the gift box

## Timeline

| Milestone | Date |
| --- | --- |
| Kickoff | 2026-10-05 |
| First review | 2026-10-08 15:00 UTC |
| Final files | 2026-11-20 |

> Keep the colour blue somewhere. It has been on every Aozora cup since 1962.

Budget: JPY 1,850,000, agreed in the signed proposal.
`;

const MEETING_NOTES = `# Meeting notes, 5 October 2026

Attendees: Ana, Raj, Tomás, Kenji (Aozora Ceramics)

## Decisions

- Two wordmark directions go to the first review on October 8
- Packaging tests use the sea-green and chalk glazes
  - Gift box first, mugs second
1. Tomás prints the dielines on Wednesday
2. Ana sends the moodboard to Kenji on Friday

## Budget check

| Line | Planned | Spent |
| --- | --- | --- |
| Photography | EUR 2,400 | EUR 0 |
| Print tests | EUR 600 | EUR 180 |

> The mark has to read at 8 mm on the bottom of a cup.

\`\`\`
print size: 8mm, min stroke 0.25pt
\`\`\`
`;

const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160">
  <rect width="480" height="160" fill="#f4f1e8"/>
  <circle cx="80" cy="80" r="48" fill="#1f3a5f"/>
  <text x="150" y="98" font-family="Georgia, serif" font-size="56" fill="#1f3a5f">aozora</text>
</svg>
`;

const SAFFRON_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#c0612b"/>
  <circle cx="160" cy="160" r="96" fill="#f3e0b5"/>
  <text x="160" y="176" text-anchor="middle" font-size="48" fill="#5a2a10">سافرون</text>
</svg>
`;

const TOKENS = {
  color: { ink: "#1f3a5f", paper: "#f4f1e8", glaze: "#6b8e9b" },
  type: { display: "Aozora Serif", text: "Inter", japanese: "Noto Sans JP" },
  radius: { card: 8, button: 6 },
};

const INVOICES = csv([
  ["invoice", "client", "issued", "due", "currency", "amount", "status"],
  ["FS-2025-004", "Kestrel Supply Co.", "2025-01-31", "2025-03-02", "EUR", 6800, "paid"],
  ["FS-2025-011", "Kestrel Supply Co.", "2025-03-28", "2025-04-27", "EUR", 12400, "paid"],
  ["FS-2025-017", "Kestrel Supply Co.", "2025-05-30", "2025-06-29", "EUR", 4200, "paid"],
  ["FS-2025-023", "Linden Books", "2025-07-15", "2025-08-14", "GBP", 3150, "paid"],
  ["FS-2025-029", "Kaltwasser GmbH", "2025-11-28", "2025-12-28", "EUR", 1500, "paid"],
  ["FS-2025-034", "Mar Azul Hotels", "2025-12-12", "2026-01-11", "EUR", 9600, "paid"],
]);

const EXPENSES = csv(
  [
    ["date", "category", "description", "amount_eur"],
    ["2025-01-14", "Software", "Ledgerline Studio, 5 seats", 95],
    ["2025-02-03", "Travel", "Train to Porto for the Kestrel recce", 64.5],
    ["2025-03-21", "Freelancers", "Photographer, Kestrel shoot", 2400],
    ["2025-04-22", "Hardware", "Laptop battery replacement", 189],
    ["2025-06-20", "Software", "Website hosting, annual", 240],
    ["2025-10-06", "Software", "Type licence, Kaltwasser pitch", 310],
  ],
  "\t",
);

const BUDGET = xlsx("Budget 2025", [
  ["Category", "Q1", "Q2", "Q3", "Q4", "Total"],
  ["Software", 1200, 1200, 1250, 1250, 4900],
  ["Hardware", 3400, 0, 800, 0, 4200],
  ["Travel", 900, 2400, 600, 1800, 5700],
  ["Freelancers", 6000, 8000, 4000, 7000, 25000],
  ["Studio rent", 5400, 5400, 5400, 5400, 21600],
]);

export const DRIVE_FILES: DriveFile[] = [
  {
    key: "welcome.txt",
    body: text(
      "Welcome to the Fernhill Studio shared drive.\n\nClient work lives under Clients/, invoices and budgets under Finance/, and everything else under Team/.\nAsk Sam for access to Finance/.\n",
    ),
    contentType: "text/plain",
  },
  { key: `${REBRAND_FOLDER}brief.md`, body: text(BRIEF), contentType: "text/markdown" },
  {
    key: `${REBRAND_FOLDER}moodboard.pdf`,
    body: () =>
      pdfDocument([
        [
          "Aozora rebrand - Moodboard",
          "",
          "1. Glaze: sea green, chalk, iron blue",
          "2. Kyoto workshop light",
        ],
        ["Type", "", "Serif display for the wordmark", "Rounded sans for packaging copy"],
        [
          "Packaging",
          "",
          "Uncoated board, blind emboss on the lid",
          "One colour print in iron blue",
        ],
      ]),
    contentType: MIME.pdf,
  },
  {
    key: `${REBRAND_FOLDER}logo-options.png`,
    body: () => asset("logo-options.png"),
    contentType: MIME.png,
  },
  { key: `${REBRAND_FOLDER}wordmark.svg`, body: text(WORDMARK_SVG), contentType: MIME.svg },
  {
    key: `${REBRAND_FOLDER}logo-pack.zip`,
    body: () =>
      zip({
        "README.txt": "Aozora logo pack, working files. Not for print.",
        "svg/wordmark.svg": WORDMARK_SVG,
        "png/logo-mark.png": asset("logo-mark.png"),
      }),
    contentType: MIME.zip,
  },
  {
    key: `${AOZORA}Proposal - signed.pdf`,
    body: () =>
      pdfDocument([
        [
          "Fernhill Studio - Proposal for Aozora Ceramics",
          "Rebrand: wordmark, colour and type system, packaging",
          "Fee: JPY 1,850,000",
          "Signed: Kenji Watanabe, 2026-07-28",
        ],
      ]),
    contentType: MIME.pdf,
  },
  {
    key: `${KALTWASSER}Angebot 2026.docx`,
    body: () =>
      docx([
        "Fernhill Studio - Angebot 2026",
        "Kunde: Kaltwasser GmbH, Hamburg",
        "Leistungen: Konzept, Design und Umsetzung der neuen Website",
        "Preis: EUR 24.800,00 zzgl. MwSt.",
      ]),
    contentType: MIME.docx,
  },
  { key: `${KALTWASSER}Pitch deck.pptx`, body: pptx, contentType: MIME.pptx },
  {
    key: `${KALTWASSER}Notizen Kickoff.md`,
    body: text(
      "# Kickoff Kaltwasser, 13.04.2026\n\n- Go-live: 26.06.2026\n- Kontaktformular auf Deutsch und Englisch\n- Ansprechpartnerin: Lena Hoffmann\n",
    ),
    contentType: "text/markdown",
  },
  { key: `${SAFFRON}musakhan.jpg`, body: () => asset("saffron-dish.jpg"), contentType: MIME.jpg },
  { key: `${SAFFRON}شعار.svg`, body: text(SAFFRON_MARK_SVG), contentType: MIME.svg },
  {
    key: `${SAFFRON}menu-proof.indd`,
    body: () => randomBytes(16 * KB, 42),
    contentType: "application/octet-stream",
  },
  { key: "Finance/2025/Budget 2025.xlsx", body: () => BUDGET, contentType: MIME.xlsx },
  { key: "Finance/2025/invoices.csv", body: text(INVOICES), contentType: MIME.csv },
  {
    key: "Finance/2025/expenses.tsv",
    body: text(EXPENSES),
    contentType: "text/tab-separated-values",
  },
  {
    key: "Team/Meeting notes 2026-10-05.md",
    body: text(MEETING_NOTES),
    contentType: "text/markdown",
  },
  {
    key: "Team/brand-tokens.json",
    body: text(`${JSON.stringify(TOKENS, null, 2)}\n`),
    contentType: "application/json",
  },
  { key: "Team/voice-memo.wav", body: () => wav(2, 440), contentType: "audio/wav" },
  { key: "Team/新しいロゴ案.png", body: () => asset("logo-mark.png"), contentType: MIME.png },
  {
    key: "Team/Offsite 2026/terrace.jpg",
    body: () => asset("offsite-terrace.jpg"),
    contentType: MIME.jpg,
  },
  {
    key: "Team/website/Dockerfile",
    body: text(
      'FROM nginx:1.27-alpine\nCOPY dist/ /usr/share/nginx/html/\nCMD ["nginx", "-g", "daemon off;"]\n',
    ),
  },
  {
    key: "Team/website/site-backup.tar.gz",
    body: () => randomBytes(8 * KB, 41),
    contentType: "application/gzip",
  },
];
