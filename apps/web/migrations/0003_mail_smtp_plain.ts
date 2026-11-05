import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0003_mail_smtp_plain", [
  "ALTER TABLE `instance_config` ADD `mail_smtp_plain` integer",
]);
