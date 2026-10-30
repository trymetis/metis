import { z } from "zod";

import { type LlmSeeds, llmKey, llmSeedsSchema } from "../lib/llm-key";

const SEEDS = Bun.file(new URL("./llm-seed.json", import.meta.url));
const seeds: LlmSeeds = (await SEEDS.exists()) ? llmSeedsSchema.parse(await SEEDS.json()) : {};

const misses: { key: string; path: string; request: unknown }[] = [];
const hits: { key: string; path: string; model: string; at: string }[] = [];

export function llmSeedCount(): number {
  return Object.keys(seeds).length;
}

export function listMisses(): Response {
  return Response.json(misses);
}

export function listHits(): Response {
  return Response.json(hits);
}

export function listModels(): Response {
  return Response.json({ object: "list", data: [] });
}

export async function handleLlm(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/^(\/api)?\/v1/, "");
  const request = z.record(z.string(), z.unknown()).parse(await req.json());
  const key = llmKey(path, request);
  const seed = seeds[key];

  if (seed) {
    hits.push({
      key,
      path,
      model: String(request.model),
      at: new Date().toISOString(),
    });
    return new Response(seed.response.body, {
      status: seed.response.status,
      headers: { "content-type": seed.response.contentType },
    });
  }

  misses.push({ key, path, request });
  console.error(
    `[harness] llm no seed ${key} (${path}, ${String(request.model)}); request at GET /llm-misses`,
  );
  return Response.json(
    {
      error: {
        message: `no llm seed ${key}; run bun run generate:record`,
        type: "llm_seed_missing",
      },
    },
    { status: 501 },
  );
}
