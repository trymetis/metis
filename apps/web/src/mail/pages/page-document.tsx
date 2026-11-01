import "server-only";
import type { ReactNode } from "react";

import { newNonce, pagePolicy, renderPage } from "./render";
import { PAGE_STYLE } from "./styles";

export function PageDocument({
  title,
  nonce,
  children,
}: {
  title: string;
  nonce: string;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      {/* oxlint-disable-next-line next/no-head-element --a route handler's own document, not a Next page */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {/* oxlint-disable-next-line react/no-danger --static stylesheet, no interpolation */}
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: PAGE_STYLE }} />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

export function errorPage(status: number, title: string, message: string): Promise<Response> {
  const nonce = newNonce();
  return renderPage(
    <PageDocument title={title} nonce={nonce}>
      <h1>{title}</h1>
      <p className="note">{message}</p>
    </PageDocument>,
    pagePolicy(nonce),
    status,
  );
}
