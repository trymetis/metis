import { docker, envValue, shell } from "@metis/e2e-cli/clients/hosts";
import { env } from "@metis/e2e-cli/lib/env";
import { z } from "zod";

export interface Database {
  url: string;
  token: string;
  host?: string;
}

export interface Fingerprint {
  rows: Record<string, string>;
  sequences: Record<string, string>;
}

const ADMIN = "http://sqld-external:9090";
const TABLES =
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE 'libsql\\_%' ESCAPE '\\' ORDER BY name";
const HAS_SEQUENCES =
  "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'";

const pipelineSchema = z.object({
  results: z.array(
    z.object({
      type: z.string(),
      response: z
        .object({
          result: z
            .object({
              rows: z.array(
                z.array(z.object({ value: z.union([z.string(), z.number()]).nullish() })),
              ),
            })
            .optional(),
        })
        .optional(),
      error: z.object({ message: z.string() }).optional(),
    }),
  ),
});

export function external(namespace: string): Database {
  return { url: `http://${namespace}.sqld-external:8080`, token: env.external.databaseToken };
}

export async function createNamespaces(namespaces: string[]): Promise<void> {
  for (const namespace of namespaces) {
    const run = await shell(
      "cli-host",
      `curl -sS -X POST -H "authorization: basic $ADMIN_KEY" -H 'content-type: application/json' -d '{}' -w '\\n%{http_code}' ${ADMIN}/v1/namespaces/${namespace}/create`,
      { env: { ADMIN_KEY: env.external.adminKey } },
    );
    const created = run.stdout.trim().endsWith("200") || run.stdout.includes("already exists");
    if (run.code !== 0 || !created) {
      throw new Error(`[database] creating ${namespace}: ${run.stdout}\n${run.stderr}`);
    }
  }
}

export async function installDatabase(namespace: "app" | "mastra"): Promise<Database> {
  const port = await docker("cli-host", ["port", "metis-sqld", "8080/tcp"], { check: true });
  const [address = ""] = port.stdout.trim().split("\n");
  const key = namespace === "app" ? "DATABASE_AUTH_TOKEN" : "MASTRA_DATABASE_AUTH_TOKEN";
  const token = await envValue("cli-host", key);
  if (!address || !token) throw new Error(`[database] the install's sqld has no ${namespace}`);
  return { url: `http://${address}`, token, host: `${namespace}.sqld:8080` };
}

export async function query(db: Database, statements: string[]): Promise<string[][][]> {
  const requests = [
    ...statements.map((sql) => ({ type: "execute", stmt: { sql } })),
    { type: "close" },
  ];
  const host = db.host ? `-H 'host: ${db.host}'` : "";
  const run = await shell(
    "cli-host",
    `curl -fsS -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' ${host} --data-binary @- ${db.url}/v2/pipeline`,
    { env: { TOKEN: db.token }, input: JSON.stringify({ requests }), check: true },
  );
  const { results } = pipelineSchema.parse(JSON.parse(run.stdout));
  return statements.map((sql, index) => {
    const result = results[index];
    if (!result?.response?.result) {
      throw new Error(`[database] ${sql}: ${result?.error?.message ?? "no result"}`);
    }
    return result.response.result.rows.map((row) => row.map((cell) => String(cell.value ?? "")));
  });
}

export async function fingerprint(db: Database): Promise<Fingerprint> {
  const [tables = [], sequenced = []] = await query(db, [TABLES, HAS_SEQUENCES]);
  const names = tables.map((row) => row[0] ?? "");
  const counts = await query(
    db,
    names.map((name) => `SELECT count(*) FROM "${name}"`),
  );
  const rows = Object.fromEntries(
    names.map((name, index) => [name, counts[index]?.[0]?.[0] ?? ""]),
  );
  if (sequenced[0]?.[0] !== "1") return { rows, sequences: {} };
  const [sequences = []] = await query(db, ["SELECT name, seq FROM sqlite_sequence ORDER BY name"]);
  return {
    rows,
    sequences: Object.fromEntries(sequences.map(([name = "", seq = ""]) => [name, seq])),
  };
}
