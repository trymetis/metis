import type { BetterAuthClientPlugin } from "better-auth";

import type { TwoFactorPlugin } from "./index";

const SESSION_CHANGING_PATHS = new Set([
  "/two-factor/enroll/confirm",
  "/two-factor/verify",
  "/two-factor/disable",
]);

export const twoFactorClient = (options: { onTwoFactorRedirect: () => void }) =>
  ({
    id: "two-factor",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Better Auth reads the server plugin's type from this phantom field; it is never read at runtime
    $InferServerPlugin: {} as TwoFactorPlugin,
    atomListeners: [
      { matcher: (path) => SESSION_CHANGING_PATHS.has(path), signal: "$sessionSignal" },
    ],
    pathMethods: {
      "/two-factor/enroll": "POST",
      "/two-factor/enroll/confirm": "POST",
      "/two-factor/challenge": "POST",
      "/two-factor/verify": "POST",
      "/two-factor/remove": "POST",
      "/two-factor/rename": "POST",
      "/two-factor/preferences": "POST",
      "/two-factor/backup-codes": "POST",
      "/two-factor/totp-uri": "POST",
      "/two-factor/disable": "POST",
      "/two-factor/methods": "GET",
    },
    fetchPlugins: [
      {
        id: "two-factor",
        name: "two-factor",
        hooks: {
          async onSuccess(context) {
            if (
              typeof context.data === "object" &&
              context.data !== null &&
              "twoFactorRedirect" in context.data &&
              context.data.twoFactorRedirect === true
            ) {
              options.onTwoFactorRedirect();
            }
          },
        },
      },
    ],
  }) satisfies BetterAuthClientPlugin;
