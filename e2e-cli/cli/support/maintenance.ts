import { expect } from "vitest";
import { z } from "zod";

const bodySchema = z.object({ error: z.literal("maintenance"), since: z.string() });

function expectMaintenanceHeaders(res: Response): string {
  expect(res.headers.get("retry-after")).toBe("300");
  expect(res.headers.get("metis-version")).toMatch(/^\d+\.\d+\.\d+/);
  const since = res.headers.get("metis-maintenance") ?? "";
  expect(Number.isNaN(Date.parse(since))).toBe(false);
  expect(Date.parse(since)).toBeLessThanOrEqual(Date.now());
  return since;
}

async function expectJson(res: Response): Promise<void> {
  const since = expectMaintenanceHeaders(res);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(bodySchema.parse(await res.json())).toEqual({ error: "maintenance", since });
}

export async function pagesShowMaintenance(app: string): Promise<void> {
  for (const path of ["/", "/dashboard", "/w/anything", "/2fa/setup"]) {
    const res = await fetch(`${app}${path}`, {
      headers: { accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
    });
    expect(res.status, path).toBe(200);
    expectMaintenanceHeaders(res);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Down for maintenance");
    expect(html).toMatch(/Since \d{2}:\d{2} UTC on \d{1,2} [A-Z][a-z]+ \d{4}/);
    expect(html).toContain("This page reloads by itself when the app is back.");
    expect(html).not.toContain("Try again in a few minutes");
  }
}

export async function callsGetMaintenanceJson(app: string): Promise<void> {
  const json = { "content-type": "application/json" };
  const calls: [string, RequestInit][] = [
    ["/rpc/user/me", { method: "POST", headers: json, body: JSON.stringify({ json: {} }) }],
    [
      "/api/mcp",
      {
        method: "POST",
        headers: { ...json, accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
    ],
    ["/api/workflows/tick", { method: "POST", headers: { "x-metis-secret": "anything" } }],
    ["/api/inbound/x", { method: "POST", headers: json, body: "{}" }],
    ["/api/auth/get-session", { method: "GET", headers: { accept: "application/json" } }],
    ["/api/drive/relay/x", { method: "GET" }],
    ["/api/drive/relay/x", { method: "PUT", body: "file contents" }],
    ["/", { method: "GET", headers: { accept: "application/json" } }],
  ];
  for (const [path, init] of calls) {
    const res = await fetch(`${app}${path}`, { ...init, redirect: "manual" });
    expect(res.status, `${init.method} ${path}`).toBe(503);
    await expectJson(res);
  }
}

export async function healthChecksAnswer(app: string): Promise<void> {
  const live = await fetch(`${app}/api/livez`);
  expect(live.status).toBe(200);
  expect(live.headers.get("metis-maintenance")).toBeNull();
  const ready = await fetch(`${app}/api/readyz`);
  expect(ready.status).toBe(200);
  expect(ready.headers.get("metis-maintenance")).toBeNull();
}

export async function inMaintenance(app: string): Promise<boolean> {
  try {
    const res = await fetch(`${app}/`, { headers: { accept: "application/json" } });
    await res.body?.cancel();
    return res.status === 503 && res.headers.has("metis-maintenance");
  } catch {
    return false;
  }
}
