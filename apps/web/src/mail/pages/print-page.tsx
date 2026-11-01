import "server-only";
import { buildFrameDocument, imageProxyEndpoint } from "../render/frame";
import { type PrintableMessage, type PrintOptions, printableMessage } from "./print";
import { newNonce, pageHeaders, renderMarkup } from "./render";

function PrintHeader({ message }: { message: PrintableMessage }) {
  return (
    <header className="print-header">
      <h1>{message.subject}</h1>
      {message.from && (
        <p>
          <strong>From:</strong> {message.from}
        </p>
      )}
      {message.to && (
        <p>
          <strong>To:</strong> {message.to}
        </p>
      )}
      {message.date && (
        <p>
          <strong>Date:</strong> {message.date}
        </p>
      )}
    </header>
  );
}

export async function printPage(raw: string, options: PrintOptions): Promise<Response> {
  const message = await printableMessage(raw, options);
  const nonce = newNonce();
  const html = buildFrameDocument(message.bodyHtml || "<em>No content</em>", {
    images: options.images,
    proxyEndpoint: options.images === "proxy" ? imageProxyEndpoint(options.origin) : null,
    adaptive: false,
    theme: "light",
    print: true,
    title: message.subject,
    header: await renderMarkup(<PrintHeader message={message} />),
    printNonce: nonce,
  });
  return new Response(html, {
    headers: pageHeaders(`script-src 'nonce-${nonce}'; form-action 'none'; frame-ancestors 'none'`),
  });
}
