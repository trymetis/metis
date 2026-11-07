import { z } from "zod";

import type { StoredConnectionCredentials } from "./types";

const serverRefSchema = z.string().trim().min(1).max(64);

const serverIdRefSchema = z.string().trim().min(1).max(64).optional();

const imapCredentialsSchema = z.object({
  provider: z.literal("imap"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  smtpAuth: z
    .object({ user: z.string().trim().min(1), pass: z.string().min(1) })
    .nullable()
    .default(null),
});

const caldavCredentialsSchema = z.object({
  provider: z.literal("caldav"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  user: z.string().trim().min(1),
  pass: z.string().min(1),
});

const carddavCredentialsSchema = caldavCredentialsSchema.extend({
  provider: z.literal("carddav"),
});

const gatewayTokenSchema = z.string().trim().min(16, "The mailbox token is at least 16 characters");

const cloudflareCredentialsSchema = z.object({
  provider: z.literal("cloudflare"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  token: gatewayTokenSchema,
});

const resendCredentialsSchema = z.object({
  provider: z.literal("resend"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  token: gatewayTokenSchema,
});

const s3CredentialsSchema = z.object({
  provider: z.literal("s3"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  bucket: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/[\s/\\]/.test(value), "Enter the bucket name on its own, with no slashes"),
  prefix: z
    .string()
    .trim()
    .transform((value) => value.replace(/^\/+|\/+$/g, ""))
    .refine((value) => !value.includes(".."), "A prefix cannot contain ..")
    .nullable()
    .default(null),
});

const rootFolderSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
  .refine(
    (value) => !value.split("/").some((part) => part === ".." || part === "."),
    "A folder cannot contain . or ..",
  )
  .refine((value) => !value.includes("\0"), "That is not a valid folder")
  .transform((value) => value || null)
  .nullable()
  .default(null);

const webdavCredentialsSchema = z.object({
  provider: z.literal("webdav"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  root: rootFolderSchema,
});

const ftpCredentialsSchema = z.object({
  provider: z.literal("ftp"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  user: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/[\r\n\0]/.test(value), "That is not a valid login"),
  pass: z
    .string()
    .min(1)
    .refine((value) => !/[\r\n\0]/.test(value), "That is not a valid password"),
  root: rootFolderSchema.refine(
    (value) => value === null || !/[\r\n]/.test(value),
    "That is not a valid folder",
  ),
});

const sftpCredentialsSchema = z.object({
  provider: z.literal("sftp"),
  serverId: serverIdRefSchema,
  server: serverRefSchema,
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  root: rootFolderSchema,
});

export const connectionCredentialsSchema = z.discriminatedUnion("provider", [
  imapCredentialsSchema,
  caldavCredentialsSchema,
  carddavCredentialsSchema,
  cloudflareCredentialsSchema,
  resendCredentialsSchema,
  s3CredentialsSchema,
  webdavCredentialsSchema,
  ftpCredentialsSchema,
  sftpCredentialsSchema,
]);

export function parseConnectionCredentials(value: unknown): StoredConnectionCredentials {
  return connectionCredentialsSchema.parse(value);
}
