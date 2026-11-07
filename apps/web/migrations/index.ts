import type { Migration } from "@/db/migrations";

import baseline from "./0000_baseline";
import workflowEngine from "./0001_workflow_engine";
import dropBillingColumns from "./0002_drop_billing_columns";
import mailSmtpPlain from "./0003_mail_smtp_plain";
import trustedProxies from "./0004_trusted_proxies";
import mailCacheDays from "./0005_mail_cache_days";
import addressBooks from "./0006_address_books";

export const MIGRATIONS: readonly Migration[] = [
  baseline,
  workflowEngine,
  dropBillingColumns,
  mailSmtpPlain,
  trustedProxies,
  mailCacheDays,
  addressBooks,
];
