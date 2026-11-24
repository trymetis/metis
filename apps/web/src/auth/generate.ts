import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/db/schema";

import { authOptions } from "./base";

export const auth = {
  options: authOptions({
    baseURL: "http://localhost:3000",
    secret: "generate-only-placeholder-secret-0000000000",
    signupDisabled: true,
    db: drizzle(createClient({ url: ":memory:" }), { schema }),
    mcpAudience: "http://localhost:3000/api/mcp",
    rateLimit: async () => ({ ok: true, remaining: 0, resetMs: 0 }),
    secondaryStorage: {
      get: async () => null,
      getAndDelete: async () => null,
      set: async () => {},
      delete: async () => {},
      increment: async () => 0,
    },
    sendMagicLink: async () => {},
    sendResetPassword: async () => {},
    sendVerificationEmail: async () => {},
    onSignIn: async () => {},
    onTwoFactorEvent: async () => {},
    onTwoFactorRedirect: () => {},
  }),
};
