import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0004_trusted_proxies", [
  "ALTER TABLE `instance_config` ADD `trusted_proxies` text",
]);
