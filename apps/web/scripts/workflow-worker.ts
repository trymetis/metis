import { config } from "@/config";
import {
  getInstanceConfig,
  loadInstanceConfig,
  startInstanceConfigPoll,
  stopInstanceConfigPoll,
} from "@/config/runtime";
import { watchInstanceConfig } from "@/config/watch";
import { buildWorkflowRunner, type WorkflowRunnerDriver } from "@/services/workflow-runner";
import { errorCode } from "@/workflow/diagnostics";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

let active: WorkflowRunnerDriver | null = null;
let stopping = false;
let queue: Promise<void> = Promise.resolve();
let maintenanceLogged = false;

async function stopActive(): Promise<void> {
  const driver = active;
  active = null;
  if (driver) await driver.stop();
}

async function stopQuietly(): Promise<void> {
  try {
    await stopActive();
  } catch (err) {
    console.error(`[workflow-worker] stop failed code=${errorCode(err)}`);
  }
}

async function startIfBullmq(): Promise<void> {
  const maintenance = config.maintenance.since;
  if (maintenance instanceof Date) {
    if (!maintenanceLogged) {
      console.log(`[workflow-worker] maintenance since ${maintenance.toISOString()}, idle`);
      maintenanceLogged = true;
    }
    return;
  }

  const runner = getInstanceConfig().workflowRunner;
  if (runner.driver !== "bullmq") {
    console.log(
      `[workflow-worker] the runner driver is "${runner.driver}" — idle until bullmq is selected`,
    );
    return;
  }

  const driver = buildWorkflowRunner(runner);
  active = driver;
  try {
    await driver.start();
  } catch (err) {
    console.error(`[workflow-worker] start failed code=${errorCode(err)}`);
    await stopQuietly();
    process.exit(1);
  }

  const readiness = await driver.ready();
  if (!readiness.database || !readiness.transport || !readiness.scheduled) {
    console.error(
      `[workflow-worker] not ready database=${readiness.database} redis=${readiness.transport} scheduler=${readiness.scheduled}${readiness.detail ? ` detail=${readiness.detail}` : ""}`,
    );
    await stopQuietly();
    process.exit(1);
  }

  console.log(
    `[workflow-worker] ready pid=${process.pid} driver=${readiness.driver} cadence=${runner.cadenceSec}s budget=${runner.tickBudgetMs}ms batch=${runner.batchSize} concurrency=${runner.concurrency}`,
  );
}

function sync(): Promise<void> {
  const previous = queue;
  queue = (async () => {
    await previous;
    if (stopping) return;
    await stopActive();
    await startIfBullmq();
  })();
  return queue;
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  stopInstanceConfigPoll();
  console.log(
    `[workflow-worker] shutdown signal=${signal} — waiting for the active tick (up to ${getInstanceConfig().workflowRunner.tickBudgetMs}ms)`,
  );
  try {
    await queue;
    await stopActive();
    console.log("[workflow-worker] exited cleanly");
    process.exit(0);
  } catch (err) {
    console.error(`[workflow-worker] shutdown failed code=${errorCode(err)}`);
    process.exit(1);
  }
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, () => void shutdown(signal));
}

process.on("unhandledRejection", (err) => {
  console.error(`[workflow-worker] unhandled rejection code=${errorCode(err)}`);
});

await loadInstanceConfig();
watchInstanceConfig({ onRunnerChange: sync });
startInstanceConfigPoll({ keepAlive: true });
await sync();
