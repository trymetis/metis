function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const blobEndpoint = optional("BLOB_ENDPOINT");
const blobBucket = optional("BLOB_BUCKET");
const blobKeyId = optional("BLOB_KEY_ID");
const blobSecret = optional("BLOB_SECRET");

const configured = [blobEndpoint, blobBucket, blobKeyId, blobSecret].filter(Boolean).length;
if (configured > 0 && configured < 4) {
  throw new Error(
    "BLOB_ENDPOINT, BLOB_BUCKET, BLOB_KEY_ID and BLOB_SECRET must be set together — set all four to use object storage, or none to keep blobs in BLOB_DIR",
  );
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  databaseAuthToken: optional("DATABASE_AUTH_TOKEN"),
  mailDomain: required("MAIL_DOMAIN").toLowerCase(),
  apiToken: required("API_TOKEN"),
  resendApiKey: required("RESEND_API_KEY"),
  webhookSecret: optional("RESEND_WEBHOOK_SECRET"),
  port: Number(optional("PORT") ?? 8787),
  pollIntervalSec: Number(optional("POLL_INTERVAL_SEC") ?? 0),
  blobDir: optional("BLOB_DIR") ?? "data/blobs",
  blob:
    blobEndpoint && blobBucket && blobKeyId && blobSecret
      ? {
          endpoint: blobEndpoint.replace(/\/+$/, ""),
          bucket: blobBucket,
          keyId: blobKeyId,
          secret: blobSecret,
          region: optional("BLOB_REGION") ?? "auto",
        }
      : null,
};

export type BlobConfig = NonNullable<typeof env.blob>;
