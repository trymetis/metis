import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0009_mail_signatures", [
  'CREATE TABLE `mail_signature` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`scope` text NOT NULL,\n\t`workspace_id` text,\n\t`mailbox_id` text,\n\t`user_id` text,\n\t`name` text NOT NULL,\n\t`html` text NOT NULL,\n\t`default_new` integer DEFAULT false NOT NULL,\n\t`default_reply` integer DEFAULT false NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT "mail_signature_owner_ck" CHECK(("scope" = \'workspace\' AND "workspace_id" IS NOT NULL AND "mailbox_id" IS NULL AND "user_id" IS NULL) OR ("scope" = \'mailbox\' AND "mailbox_id" IS NOT NULL AND "workspace_id" IS NULL AND "user_id" IS NULL) OR ("scope" = \'personal\' AND "mailbox_id" IS NOT NULL AND "user_id" IS NOT NULL AND "workspace_id" IS NULL))\n)',
  "CREATE INDEX `mail_signature_workspace_idx` ON `mail_signature` (`workspace_id`)",
  "CREATE INDEX `mail_signature_mailbox_idx` ON `mail_signature` (`mailbox_id`)",
  "CREATE INDEX `mail_signature_user_idx` ON `mail_signature` (`user_id`)",
  "ALTER TABLE `workspace` ADD `mail_footer_html` text DEFAULT '' NOT NULL",
  "ALTER TABLE `workspace` ADD `mail_footer_enabled` integer DEFAULT false NOT NULL",
]);
