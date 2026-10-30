import type { Migration } from "@/db/migrations";

import baseline from "./0000_baseline";
import workflowEngine from "./0001_workflow_engine";
import dropBillingColumns from "./0002_drop_billing_columns";

export const MIGRATIONS: readonly Migration[] = [baseline, workflowEngine, dropBillingColumns];
