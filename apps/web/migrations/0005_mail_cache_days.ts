import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0005_mail_cache_days", [
  "ALTER TABLE `instance_config` ADD `mail_cache_days` integer",
]);
