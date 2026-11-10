import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0008_invites_and_instance_roles", [
  "ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL",
  "ALTER TABLE `user` ADD `banned` integer DEFAULT false NOT NULL",
  "ALTER TABLE `user` ADD `ban_reason` text",
  "ALTER TABLE `user` ADD `ban_expires` integer",
  "CREATE TABLE `invite` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`email` text NOT NULL,\n\t`token_hash` text NOT NULL,\n\t`workspace_id` text,\n\t`workspace_role` text,\n\t`instance_role` text,\n\t`invited_by` text,\n\t`expires_at` integer NOT NULL,\n\t`accepted_at` integer,\n\t`accepted_user_id` text,\n\t`declined_at` integer,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`accepted_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null\n)",
  "CREATE UNIQUE INDEX `invite_token_hash_idx` ON `invite` (`token_hash`)",
  'CREATE UNIQUE INDEX `invite_pending_account_idx` ON `invite` (`email`) WHERE "invite"."workspace_id" is null and "invite"."accepted_at" is null and "invite"."declined_at" is null',
  'CREATE UNIQUE INDEX `invite_pending_workspace_idx` ON `invite` (`email`,`workspace_id`) WHERE "invite"."workspace_id" is not null and "invite"."accepted_at" is null and "invite"."declined_at" is null',
  "CREATE INDEX `invite_workspace_idx` ON `invite` (`workspace_id`)",
  "CREATE INDEX `invite_invited_by_idx` ON `invite` (`invited_by`)",
  "INSERT INTO `invite` (`id`, `email`, `token_hash`, `workspace_id`, `workspace_role`, `instance_role`, `invited_by`, `expires_at`, `accepted_at`, `accepted_user_id`, `declined_at`, `created_at`) SELECT `id`, `email`, `token_hash`, NULL, NULL, NULL, `invited_by`, `expires_at`, `accepted_at`, `accepted_user_id`, NULL, `created_at` FROM `signup_invite`",
  "INSERT INTO `invite` (`id`, `email`, `token_hash`, `workspace_id`, `workspace_role`, `instance_role`, `invited_by`, `expires_at`, `accepted_at`, `accepted_user_id`, `declined_at`, `created_at`) SELECT `w`.`id`, `w`.`email`, `w`.`token_hash`, `w`.`workspace_id`, CASE WHEN `w`.`role` = 'admin' THEN 'admin' ELSE 'member' END, NULL, (SELECT `u`.`id` FROM `user` `u` WHERE `u`.`id` = `w`.`invited_by`), `w`.`expires_at`, `w`.`accepted_at`, NULL, NULL, `w`.`created_at` FROM `workspace_invite` `w` WHERE `w`.`accepted_at` IS NOT NULL OR NOT EXISTS (SELECT 1 FROM `workspace_invite` `n` WHERE `n`.`workspace_id` = `w`.`workspace_id` AND `n`.`email` = `w`.`email` AND `n`.`accepted_at` IS NULL AND (`n`.`created_at` > `w`.`created_at` OR (`n`.`created_at` = `w`.`created_at` AND `n`.`id` > `w`.`id`)))",
  "CREATE TABLE `last_sign_in` (\n\t`user_id` text PRIMARY KEY NOT NULL,\n\t`signed_in_at` integer NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "INSERT INTO `last_sign_in` (`user_id`, `signed_in_at`) SELECT `user_id`, max(`created_at`) FROM `session` GROUP BY `user_id`",
  "DROP TABLE `signup_invite`",
  "DROP TABLE `workspace_invite`",
]);
