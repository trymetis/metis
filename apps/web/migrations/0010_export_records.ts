import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0010_export_records", [
  "CREATE TABLE `export_record` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`app_version` text NOT NULL,\n\t`migration` text NOT NULL,\n\t`maintenance_since` integer,\n\t`file_name` text NOT NULL,\n\t`size` integer NOT NULL,\n\t`sha256` text NOT NULL,\n\t`recipients` text NOT NULL,\n\t`locations` text NOT NULL,\n\t`instance_url` text NOT NULL\n)",
  "CREATE INDEX `export_record_created_idx` ON `export_record` (`created_at`)",
]);
