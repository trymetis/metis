import { schemaMigration } from "@/db/migrations";

const KEPT_TWO_FACTOR_ROW =
  "`id` = (SELECT `kept`.`id` FROM `two_factor` AS `kept` WHERE `kept`.`user_id` = `two_factor`.`user_id` ORDER BY coalesce(`kept`.`verified`, 1) DESC, `kept`.`id` ASC LIMIT 1)";

export default schemaMigration("0012_two_factor_methods", [
  "CREATE TABLE `totp` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`secret` text NOT NULL,\n\t`verified` integer DEFAULT false NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE UNIQUE INDEX `totp_user_id_unique` ON `totp` (`user_id`)",
  `INSERT INTO \`totp\` (\`id\`, \`user_id\`, \`secret\`, \`verified\`) SELECT \`id\`, \`user_id\`, \`secret\`, coalesce(\`verified\`, 1) FROM \`two_factor\` WHERE ${KEPT_TWO_FACTOR_ROW}`,
  "CREATE TABLE `two_factor_next` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`backup_codes` text NOT NULL,\n\t`preferred_method` text,\n\t`failed_verification_count` integer DEFAULT 0,\n\t`locked_until` integer,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  `INSERT INTO \`two_factor_next\` (\`id\`, \`user_id\`, \`backup_codes\`, \`failed_verification_count\`, \`locked_until\`) SELECT \`id\`, \`user_id\`, \`backup_codes\`, \`failed_verification_count\`, \`locked_until\` FROM \`two_factor\` WHERE ${KEPT_TWO_FACTOR_ROW}`,
  "DROP TABLE `two_factor`",
  "ALTER TABLE `two_factor_next` RENAME TO `two_factor`",
  "CREATE UNIQUE INDEX `two_factor_user_id_unique` ON `two_factor` (`user_id`)",
  "CREATE TABLE `passkey` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text,\n\t`public_key` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`credential_id` text NOT NULL,\n\t`counter` integer NOT NULL,\n\t`device_type` text NOT NULL,\n\t`backed_up` integer NOT NULL,\n\t`transports` text,\n\t`created_at` integer,\n\t`aaguid` text,\n\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n)",
  "CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`)",
  "CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`)",
]);
