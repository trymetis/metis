export const INSTANCE_CONFIG_KINDS = ["seed", "edit", "revert", "reset"] as const;
export type InstanceConfigKind = (typeof INSTANCE_CONFIG_KINDS)[number];

export const CONFIG_SECTIONS = [
  "llm",
  "decision",
  "phishingDetection",
  "mailer",
  "signup",
  "legal",
  "relay",
  "imageProxy",
  "proxies",
  "mailCache",
  "cache",
  "workflowRunner",
  "google",
  "microsoft",
  "zoho",
  "imapServers",
  "caldavServers",
  "cloudflareServers",
  "resendServers",
  "s3Servers",
  "webdavServers",
  "ftpServers",
  "sftpServers",
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];

export const CONFIG_SECTION_LABELS: Record<ConfigSection, string> = {
  llm: "LLM",
  decision: "Decision model",
  phishingDetection: "Phishing detection",
  mailer: "Mail",
  signup: "Sign-up",
  legal: "Legal consent",
  relay: "Drive relay",
  imageProxy: "Mail image proxy",
  proxies: "Proxies",
  mailCache: "Mail cache",
  cache: "Cache",
  workflowRunner: "Workflow runner",
  google: "Google",
  microsoft: "Microsoft",
  zoho: "Zoho",
  imapServers: "IMAP servers",
  caldavServers: "CalDAV servers",
  cloudflareServers: "Cloudflare Email servers",
  resendServers: "Resend servers",
  s3Servers: "S3 servers",
  webdavServers: "WebDAV servers",
  ftpServers: "FTP servers",
  sftpServers: "SFTP servers",
};

export const CONFIG_FIELD_KINDS = ["text", "url", "secret", "number", "boolean", "select"] as const;
export type ConfigFieldKind = (typeof CONFIG_FIELD_KINDS)[number];
