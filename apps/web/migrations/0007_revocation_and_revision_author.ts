import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0007_revocation_and_revision_author", [
  "ALTER TABLE `mcp_client` ADD `tokens_revoked_at` integer",
  "ALTER TABLE `workflow_revision` ADD `created_by_user_id` text REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null",
]);
