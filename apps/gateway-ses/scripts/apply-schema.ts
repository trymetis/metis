import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
const client = createClient({ url, ...(authToken ? { authToken } : {}) });

try {
  await client.executeMultiple(await Bun.file(new URL("../schema.sql", import.meta.url)).text());
  console.log("[metis-ses] schema applied");
} catch (err) {
  console.error("[metis-ses] could not apply the schema", err);
  process.exit(1);
} finally {
  client.close();
}
