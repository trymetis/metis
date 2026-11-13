import { sesVerify } from "@/mail/providers/ses";

import { createGatewayDriver } from "./gateway";

export const sesDriver = createGatewayDriver({
  provider: "ses",
  label: "Amazon SES",
  adminTokenHint:
    "That is the gateway's admin token, not a mailbox token. Ask whoever runs the gateway for this address's mailbox token and use that instead.",
  verify: sesVerify,
});
