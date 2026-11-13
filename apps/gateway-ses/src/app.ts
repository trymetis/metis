import { type Gateway, handleRequest } from "@metis/gateway-contract/router";

import { env } from "./env";
import { sendMail } from "./send";
import { store } from "./store";

const gateway: Gateway = {
  tag: "metis-ses",
  domain: env.mailDomain,
  apiToken: env.apiToken,
  health: { backend: "ses" },
  store,
  send: sendMail,
};

export function handle(request: Request): Promise<Response> {
  return handleRequest(request, gateway);
}
