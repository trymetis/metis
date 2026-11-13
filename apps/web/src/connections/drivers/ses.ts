import { sesVerify } from "@/mail/providers/ses";

import { createGatewayDriver } from "./gateway";

export const sesDriver = createGatewayDriver({
  provider: "ses",
  label: "Amazon SES",
  adminTokenHint:
    "That is the gateway's admin token — mint a mailbox token with bun run token and use that instead.",
  verify: sesVerify,
});
