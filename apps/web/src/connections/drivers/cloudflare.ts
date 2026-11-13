import { cloudflareVerify } from "@/mail/providers/cloudflare";

import { createGatewayDriver } from "./gateway";

export const cloudflareDriver = createGatewayDriver({
  provider: "cloudflare",
  label: "Cloudflare Email",
  adminTokenHint:
    "That is the gateway's admin token, not a mailbox token. Ask whoever runs the gateway for this address's mailbox token and use that instead.",
  verify: cloudflareVerify,
});
