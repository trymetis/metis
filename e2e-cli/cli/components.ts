import { RpcError } from "@metis/e2e/clients/rpc";
import { expect as expectPage } from "@playwright/test";
import { expect, test } from "vitest";

import { APP, envValue, metis, status, waitReady } from "../clients/hosts";
import { withAnaPage } from "./support/browser";
import { output } from "./support/output";
import { anaRpc, forgetSession } from "./support/session";

async function run(args: string[]): Promise<string> {
  const result = await metis("cli-host", [...args, "--yes"]);
  expect(result.code, output(result)).toBe(0);
  await waitReady(APP);
  forgetSession();
  return output(result);
}

async function components(): Promise<string[]> {
  return (await status("cli-host")).components.map((c) => c.name);
}

async function s3ServerNames(): Promise<string[]> {
  return withAnaPage(async (page) => {
    await page.goto("/dashboard/system/providers/s3");
    const main = page.getByRole("main");
    await expectPage(main.getByRole("button", { name: "Add server" })).toBeVisible();
    const names: string[] = [];
    for (const input of await main.getByRole("textbox", { name: "Name", exact: true }).all()) {
      names.push(await input.inputValue());
    }
    return names;
  });
}

async function containers(): Promise<string[]> {
  return (await status("cli-host")).containers.map((c) => c.name);
}

export default function componentTests() {
  test("remove worker forces the internal runner and stops the workers; add worker brings them back on bullmq", async () => {
    await run(["remove", "worker"]);
    expect(await components()).not.toContain("worker");
    expect(await containers()).not.toContain("metis-worker-1");
    expect(await envValue("cli-host", "METIS_WORKFLOW_RUNNER_DRIVER")).toBe("internal");

    await run(["add", "worker"]);
    expect(await components()).toEqual(expect.arrayContaining(["worker", "redis"]));
    expect(await containers()).toContain("metis-worker-1");
    expect(await envValue("cli-host", "METIS_WORKFLOW_RUNNER_DRIVER")).toBe("bullmq");
    await withAnaPage(async (page) => {
      await page.goto("/dashboard/system/history");
      const current = page.getByRole("main").getByRole("row").filter({ hasText: "Current" });
      await expectPage(current).toContainText("Server");
      await expectPage(current).toContainText("Workflow runner");
      await expectPage(current).toContainText("Preflight");
    });

    await run(["config", "set", "METIS_WORKFLOW_RUNNER_DRIVER=internal"]);
  });

  test("remove redis is refused while the workers use it", async () => {
    const result = await metis("cli-host", ["remove", "redis", "--yes"]);
    expect(result.code).not.toBe(0);
    expect(output(result)).toContain("The workers use redis; run metis remove worker first");
  });

  test("add objstore runs RustFS with a server entry, and remove objstore --purge takes both away", async () => {
    await run(["add", "objstore"]);
    expect(await components()).toContain("objstore");
    expect(await containers()).toContain("metis-objstore");
    expect(await envValue("cli-host", "METIS_S3_SERVERS")).toContain('"id":"metis-objstore"');
    expect(await s3ServerNames()).toContain("Server storage");

    await run(["remove", "objstore", "--purge"]);
    expect(await components()).not.toContain("objstore");
    expect(await containers()).not.toContain("metis-objstore");
    expect((await envValue("cli-host", "METIS_S3_SERVERS")) ?? "").not.toContain("metis-objstore");
    expect(await s3ServerNames()).not.toContain("Server storage");
  });

  test("remove updater hides Dashboard → Updates, and add updater --docker brings it back", async () => {
    await run(["remove", "updater"]);
    expect(await containers()).not.toContain("metis-updater");
    const hidden = await (
      await anaRpc()
    )("dashboard.system.updates").then(
      () => null,
      (err: unknown) => err,
    );
    expect(hidden).toBeInstanceOf(RpcError);
    await withAnaPage(async (page) => {
      await page.goto("/dashboard/system");
      const sidebar = page.getByRole("complementary", { name: "Dashboard" });
      await expectPage(sidebar.getByRole("link", { name: "History", exact: true })).toBeVisible();
      await expectPage(sidebar.getByRole("link", { name: "Updates", exact: true })).toHaveCount(0);
    });

    await run(["add", "updater", "--docker"]);
    expect(await containers()).toContain("metis-updater");
    await expect
      .poll(
        async () =>
          (await (await anaRpc())<{ reachable: boolean }>("dashboard.system.updates")).reachable,
        { timeout: 60_000 },
      )
      .toBe(true);
    await withAnaPage(async (page) => {
      await page.goto("/dashboard/system");
      await expectPage(
        page
          .getByRole("complementary", { name: "Dashboard" })
          .getByRole("link", { name: "Updates", exact: true }),
      ).toBeVisible();
    });
  });
}
