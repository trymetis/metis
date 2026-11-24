import type { BetterAuthPluginDBSchema } from "better-auth";

export const twoFactorSchema = {
  user: {
    fields: {
      twoFactorEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  twoFactor: {
    fields: {
      userId: {
        type: "string",
        required: true,
        returned: false,
        unique: true,
        references: { model: "user", field: "id" },
      },
      backupCodes: { type: "string", required: true, returned: false },
      preferredMethod: { type: "string", required: false, input: false, returned: false },
      failedVerificationCount: {
        type: "number",
        required: false,
        defaultValue: 0,
        input: false,
        returned: false,
      },
      lockedUntil: { type: "date", required: false, input: false, returned: false },
    },
  },
  totp: {
    fields: {
      userId: {
        type: "string",
        required: true,
        returned: false,
        unique: true,
        references: { model: "user", field: "id" },
      },
      secret: { type: "string", required: true, returned: false },
      verified: { type: "boolean", required: true, defaultValue: false, input: false },
    },
  },
  passkey: {
    fields: {
      name: { type: "string", required: false },
      publicKey: { type: "string", required: true },
      userId: {
        type: "string",
        references: { model: "user", field: "id" },
        required: true,
        index: true,
      },
      credentialID: { type: "string", required: true, index: true },
      counter: { type: "number", required: true },
      deviceType: { type: "string", required: true },
      backedUp: { type: "boolean", required: true },
      transports: { type: "string", required: false },
      createdAt: { type: "date", required: false },
      aaguid: { type: "string", required: false },
    },
  },
} satisfies BetterAuthPluginDBSchema;
