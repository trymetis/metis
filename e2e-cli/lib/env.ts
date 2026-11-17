import { z } from "zod";

const text = z.string().min(1);

const envSchema = z
  .object({
    E2E_RESEND_DOMAIN: text,
    E2E_RESEND_GATEWAY_ADMIN_TOKEN: text,
    E2E_RESEND_API_KEY: text,
    E2E_SES_DATABASE_AUTH_TOKEN: text,
    E2E_EXTERNAL_DATABASE_AUTH_TOKEN: text,
    E2E_EXTERNAL_DATABASE_ADMIN_KEY: text,
    E2E_FAKES_URL: z.url(),
    E2E_REGISTRY: text,
  })
  .transform((e) => ({
    resend: {
      domain: e.E2E_RESEND_DOMAIN,
      adminToken: e.E2E_RESEND_GATEWAY_ADMIN_TOKEN,
      apiKey: e.E2E_RESEND_API_KEY,
    },
    ses: {
      databaseToken: e.E2E_SES_DATABASE_AUTH_TOKEN,
    },
    external: {
      databaseToken: e.E2E_EXTERNAL_DATABASE_AUTH_TOKEN,
      adminKey: e.E2E_EXTERNAL_DATABASE_ADMIN_KEY,
    },
    fakesUrl: e.E2E_FAKES_URL.replace(/\/+$/, ""),
    registry: e.E2E_REGISTRY,
  }));

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`[env] e2e-cli env is invalid:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
