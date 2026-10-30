import { schemaMigration } from "@/db/migrations";

export default schemaMigration("0002_drop_billing_columns", [
  "ALTER TABLE `user` DROP COLUMN `subscription_status`",
  "ALTER TABLE `user` DROP COLUMN `dodo_customer_id`",
  "ALTER TABLE `user` DROP COLUMN `dodo_subscription_id`",
  "ALTER TABLE `user` DROP COLUMN `subscription_product_id`",
  "ALTER TABLE `user` DROP COLUMN `subscription_updated_at`",
  "ALTER TABLE `workspace` DROP COLUMN `plan`",
]);
