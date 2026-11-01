import "server-only";
import {
  AUTH_METHODS,
  type AuthMethod,
  type OriginalSummary,
  SHOWN_LIMIT,
  summarizeOriginal,
} from "./original";
import { PageDocument } from "./page-document";
import { newNonce, pagePolicy, renderPage } from "./render";

const AUTH_LABELS: Record<AuthMethod, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC" };

const COPY_SCRIPT = `
const button = document.getElementById("copy");
button?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("raw").textContent);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => { button.textContent = "Copy to clipboard"; }, 2000);
});
`;

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </>
  );
}

function AuthRow({ method, result }: { method: AuthMethod; result: string | null }) {
  const tone = result === "pass" ? "pass" : result === "fail" ? "fail" : undefined;
  return (
    <Row label={AUTH_LABELS[method]} value={result?.toUpperCase() ?? "Not reported"} tone={tone} />
  );
}

function OriginalPage({
  summary,
  raw,
  downloadHref,
  nonce,
}: {
  summary: OriginalSummary;
  raw: string;
  downloadHref: string;
  nonce: string;
}) {
  const subject = summary.subject || "(no subject)";
  const truncated = raw.length > SHOWN_LIMIT;
  return (
    <PageDocument title={`Original — ${subject}`} nonce={nonce}>
      <h1>Original message</h1>
      <dl className="summary" aria-label="Message summary">
        <Row label="Message ID" value={summary.messageId || "—"} />
        <Row label="Date" value={summary.date || "—"} />
        <Row label="From" value={summary.from || "—"} />
        <Row label="To" value={summary.to || "—"} />
        <Row label="Subject" value={subject} />
        {AUTH_METHODS.map((method) => (
          <AuthRow key={method} method={method} result={summary.auth.results[method]} />
        ))}
      </dl>
      {summary.auth.reportedBy && (
        <p className="note">Authentication results as reported by {summary.auth.reportedBy}.</p>
      )}
      <div className="actions">
        <a className="action" href={downloadHref} download>
          Download original
        </a>
        {!truncated && (
          <button className="action" type="button" id="copy">
            Copy to clipboard
          </button>
        )}
      </div>
      {truncated && (
        <p className="note">
          This message is too large to show in full. Download the original to see all of it.
        </p>
      )}
      <pre className="source" id="raw" aria-label="Raw message">
        {truncated ? raw.slice(0, SHOWN_LIMIT) : raw}
      </pre>
      {!truncated && (
        // oxlint-disable-next-line react/no-danger --static script, no interpolation
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: COPY_SCRIPT }} />
      )}
    </PageDocument>
  );
}

export async function originalPage(raw: string, downloadHref: string): Promise<Response> {
  const nonce = newNonce();
  return renderPage(
    <OriginalPage
      summary={await summarizeOriginal(raw)}
      raw={raw}
      downloadHref={downloadHref}
      nonce={nonce}
    />,
    pagePolicy(nonce),
  );
}
