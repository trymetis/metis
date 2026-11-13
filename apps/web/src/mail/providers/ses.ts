import type { GatewayCredentials } from "@/connections/types";

import { gatewayHealth, gatewayTarget } from "./gateway-client";

export async function sesVerify(
  credentials: GatewayCredentials,
): Promise<{ domain: string | null; address: string | null }> {
  const { backend, domain, address } = await gatewayHealth(
    gatewayTarget({ ...credentials, provider: "ses" }),
  );
  if (backend !== null && backend !== "ses") {
    throw new Error(
      `That endpoint is a ${backend} gateway, but it is configured here as an Amazon SES one.`,
    );
  }
  return { domain, address };
}
