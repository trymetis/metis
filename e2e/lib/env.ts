import { z } from "zod";

const text = z.string().min(1);

const jsonList = z.string().transform((raw, ctx) => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "must be a JSON list" });
    return z.NEVER;
  }
});

const serverName = jsonList
  .pipe(z.array(z.object({ name: text })).min(1))
  .transform(([first]) => first?.name ?? "");

const serverNames = jsonList
  .pipe(z.array(z.object({ name: text })).min(1))
  .transform((servers) => servers.map((server) => server.name));

const caldavServer = jsonList
  .pipe(z.array(z.object({ name: text, url: z.url() })).min(1))
  .transform(([first]) => ({ name: first?.name ?? "", url: first?.url ?? "" }));

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_AUTH_TOKEN: text,
    MASTRA_DATABASE_URL: z.url(),
    MASTRA_DATABASE_AUTH_TOKEN: text,

    METIS_IMAP_SERVERS: serverName,
    METIS_CALDAV_SERVERS: caldavServer,
    METIS_CARDDAV_SERVERS: caldavServer,
    METIS_S3_SERVERS: serverNames,
    METIS_WEBDAV_SERVERS: serverName,
    METIS_FTP_SERVERS: serverNames,
    METIS_SFTP_SERVERS: serverName,
    METIS_SOURCE_URL: z.url(),

    E2E_USER_NAME: text,
    E2E_USER_EMAIL: z.email(),
    E2E_USER_PASSWORD: text,

    E2E_MEMBER_NAME: text,
    E2E_MEMBER_EMAIL: z.email(),
    E2E_MEMBER_PASSWORD: text,

    E2E_GATEWAY_URL: z.url(),
    E2E_GATEWAY_DOMAIN: text,
    E2E_GATEWAY_ADMIN_TOKEN: text,

    E2E_RESEND_GATEWAY_URL: z.url(),
    E2E_RESEND_DOMAIN: text,
    E2E_RESEND_GATEWAY_ADMIN_TOKEN: text,
    E2E_RESEND_API_KEY: text,
    E2E_RESEND_CONTROL_URL: z.url(),

    E2E_REDIS_URL: text,
    E2E_UPSTASH_URL: z.url(),
    E2E_UPSTASH_TOKEN: text,
    E2E_SRH_URL: z.url(),

    E2E_SYSTEM_MAIL_DOMAIN: text,
    E2E_SYSTEM_MAIL_USER: text,
    E2E_CONSOLE_MAIL_URL: z.url(),
    E2E_CONSOLE_MAIL_TOKEN: text,

    E2E_IMAP_HOST: text,
    E2E_IMAP_PORT: z.coerce.number().int().min(1).max(65_535),
    E2E_SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
    E2E_IMAP_USER: text,
    E2E_IMAP_PASS: text,

    E2E_CALDAV_URL: z.url(),
    E2E_CALDAV_USER: text,
    E2E_CALDAV_PASS: text,
    E2E_CALDAV_STRESS_USER: text,
    E2E_CALDAV_STRESS_PASS: text,

    E2E_S3_ENDPOINT: z.url(),
    E2E_S3_ACCESS_KEY: text,
    E2E_S3_SECRET_KEY: text,
    E2E_S3_BUCKET: text,

    E2E_WEBDAV_URL: z.url(),
    E2E_WEBDAV_USER: text,
    E2E_WEBDAV_PASS: text,

    E2E_FTP_HOST: text,
    E2E_FTP_PORT: z.coerce.number().int().min(1).max(65_535),
    E2E_FTP_USER: text,
    E2E_FTP_PASS: text,

    E2E_SFTP_HOST: text,
    E2E_SFTP_PORT: z.coerce.number().int().min(1).max(65_535),
    E2E_SFTP_USER: text,
    E2E_SFTP_PASS: text,
    E2E_SFTP_ROOT: text,

    E2E_EDGE: z.enum(["0", "1"]).default("1"),
    E2E_LLM_FORCE: z.enum(["0", "1"]).default("0"),
    E2E_GENERATE_DIR: text,

    LLM_UPSTREAM_URL: z.url().optional(),
    LLM_UPSTREAM_KEY: text.optional(),
    TYPESAFE_UPSTREAM_URL: z.url().optional(),
    TYPESAFE_UPSTREAM_KEY: text.optional(),
  })
  .transform((e) => ({
    database: { url: e.DATABASE_URL, authToken: e.DATABASE_AUTH_TOKEN },
    mastraDatabase: {
      url: e.MASTRA_DATABASE_URL,
      authToken: e.MASTRA_DATABASE_AUTH_TOKEN,
    },
    servers: {
      imap: e.METIS_IMAP_SERVERS,
      caldav: e.METIS_CALDAV_SERVERS.name,
      caldavOrigin: new URL(e.METIS_CALDAV_SERVERS.url).origin,
      carddav: e.METIS_CARDDAV_SERVERS.name,
      carddavOrigin: new URL(e.METIS_CARDDAV_SERVERS.url).origin,
      s3: e.METIS_S3_SERVERS,
      webdav: e.METIS_WEBDAV_SERVERS,
      ftp: e.METIS_FTP_SERVERS,
      sftp: e.METIS_SFTP_SERVERS,
    },
    sourceUrl: e.METIS_SOURCE_URL,
    user: {
      name: e.E2E_USER_NAME,
      email: e.E2E_USER_EMAIL,
      password: e.E2E_USER_PASSWORD,
    },
    member: {
      name: e.E2E_MEMBER_NAME,
      email: e.E2E_MEMBER_EMAIL,
      password: e.E2E_MEMBER_PASSWORD,
    },
    gateway: {
      url: e.E2E_GATEWAY_URL.replace(/\/+$/, ""),
      domain: e.E2E_GATEWAY_DOMAIN,
      adminToken: e.E2E_GATEWAY_ADMIN_TOKEN,
    },
    resend: {
      gatewayUrl: e.E2E_RESEND_GATEWAY_URL.replace(/\/+$/, ""),
      domain: e.E2E_RESEND_DOMAIN,
      adminToken: e.E2E_RESEND_GATEWAY_ADMIN_TOKEN,
      apiKey: e.E2E_RESEND_API_KEY,
      controlUrl: e.E2E_RESEND_CONTROL_URL.replace(/\/+$/, ""),
    },
    cache: {
      redisUrl: e.E2E_REDIS_URL,
      upstashUrl: e.E2E_UPSTASH_URL,
      upstashToken: e.E2E_UPSTASH_TOKEN,
      srhUrl: e.E2E_SRH_URL.replace(/\/+$/, ""),
    },
    systemMail: {
      domain: e.E2E_SYSTEM_MAIL_DOMAIN,
      user: e.E2E_SYSTEM_MAIL_USER,
    },
    consoleMail: {
      url: e.E2E_CONSOLE_MAIL_URL,
      token: e.E2E_CONSOLE_MAIL_TOKEN,
    },
    imap: {
      host: e.E2E_IMAP_HOST,
      port: e.E2E_IMAP_PORT,
      smtpPort: e.E2E_SMTP_PORT,
      user: e.E2E_IMAP_USER,
      pass: e.E2E_IMAP_PASS,
    },
    caldav: {
      url: e.E2E_CALDAV_URL,
      user: e.E2E_CALDAV_USER,
      pass: e.E2E_CALDAV_PASS,
    },
    caldavStress: {
      url: e.E2E_CALDAV_URL,
      user: e.E2E_CALDAV_STRESS_USER,
      pass: e.E2E_CALDAV_STRESS_PASS,
    },
    s3: {
      endpoint: e.E2E_S3_ENDPOINT,
      accessKeyId: e.E2E_S3_ACCESS_KEY,
      secretAccessKey: e.E2E_S3_SECRET_KEY,
      bucket: e.E2E_S3_BUCKET,
    },
    webdav: {
      url: e.E2E_WEBDAV_URL,
      user: e.E2E_WEBDAV_USER,
      pass: e.E2E_WEBDAV_PASS,
    },
    ftp: {
      host: e.E2E_FTP_HOST,
      port: e.E2E_FTP_PORT,
      user: e.E2E_FTP_USER,
      pass: e.E2E_FTP_PASS,
    },
    sftp: {
      host: e.E2E_SFTP_HOST,
      port: e.E2E_SFTP_PORT,
      user: e.E2E_SFTP_USER,
      pass: e.E2E_SFTP_PASS,
      root: e.E2E_SFTP_ROOT,
    },
    edge: e.E2E_EDGE === "1",
    generateDir: e.E2E_GENERATE_DIR,
    llm: {
      upstreamUrl: e.LLM_UPSTREAM_URL?.replace(/\/+$/, ""),
      upstreamKey: e.LLM_UPSTREAM_KEY,
      force: e.E2E_LLM_FORCE === "1",
    },
    typesafe: {
      upstreamUrl: e.TYPESAFE_UPSTREAM_URL?.replace(/\/+$/, ""),
      upstreamKey: e.TYPESAFE_UPSTREAM_KEY,
    },
  }));

function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

const parsed = envSchema.safeParse(withoutEmpty(process.env));
if (!parsed.success) {
  throw new Error(`e2e env is invalid:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
