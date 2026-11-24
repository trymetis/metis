import { readLists } from "./entries.ts";

try {
  readLists();
} catch (error) {
  console.error(`[screenshots] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
