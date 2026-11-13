export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const building = process.env.NEXT_PHASE === "phase-production-build";

  if (!building) {
    const { loadInstanceConfig } = await import("./config/runtime");
    await loadInstanceConfig();
  }

  const { warnIfMailUndelivered } = await import("./services/mailer");
  warnIfMailUndelivered();

  const { warmupCache } = await import("./services/cache");
  await warmupCache();

  if (building) return;

  const { startInstanceConfigPoll } = await import("./config/runtime");
  const { watchInstanceConfig } = await import("./config/watch");
  const { config } = await import("./config");
  const maintenance = config.maintenance.since;
  if (maintenance instanceof Date) {
    console.log(
      `[instrumentation] maintenance since ${maintenance.toISOString()}, the in-process runner stays off`,
    );
    watchInstanceConfig({});
    startInstanceConfigPoll();
    return;
  }

  const { startInProcessRunner, syncInProcessRunner } = await import("./services/workflow-runner");
  watchInstanceConfig({ onRunnerChange: syncInProcessRunner });
  startInstanceConfigPoll();
  await startInProcessRunner();
}
