import { resendVerify } from "@/mail/providers/resend";

import { createGatewayDriver } from "./gateway";

export const resendDriver = createGatewayDriver({
  provider: "resend",
  label: "Resend",
  adminTokenHint:
    "That is the gateway's admin token, not a mailbox token. Ask whoever runs the gateway for this address's mailbox token and use that instead.",
  verify: resendVerify,
});
