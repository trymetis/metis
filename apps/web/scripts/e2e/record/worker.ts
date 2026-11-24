import { scenarioSchema, type Step } from "./catalog";
import type { WorkerMessage } from "./spawn";
import type { StepContext } from "./steps/context";

const STEPS: Record<Step, () => Promise<{ run(ctx: StepContext): Promise<void> }>> = {
  world: () => import("./steps/world"),
  mail: () => import("./steps/mail"),
  "smart-replies": () => import("./steps/smart-replies"),
  "compose-ai": () => import("./steps/compose-ai"),
  chat: () => import("./steps/chats"),
  workflows: () => import("./steps/workflows"),
  "late-arrival": () => import("./steps/late-arrival"),
  mcp: () => import("./steps/mcp"),
};

function send(message: WorkerMessage): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) {
      resolve();
      return;
    }
    process.send(message, () => resolve());
  });
}

function settled(): Promise<void> {
  return new Promise((resolve) => {
    const onMessage = (message: { type?: string }) => {
      if (message.type !== "settled") return;
      process.off("message", onMessage);
      resolve();
    };
    process.on("message", onMessage);
    void send({ type: "settle" });
  });
}

async function fail(err: unknown): Promise<never> {
  const error = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[record] ${error}`);
  await send({ type: "done", ok: false, error });
  process.exit(1);
}

process.on("uncaughtException", (err) => void fail(err));
process.on("unhandledRejection", (err) => void fail(err));

const scenario = scenarioSchema.parse(JSON.parse(process.env.RECORD_SCENARIO ?? "null"));
const worldPath = process.env.RECORD_WORLD ?? "";

try {
  const { signIn } = await import("./session");
  const session = await signIn();
  const step = await STEPS[scenario.step]();
  console.log(`[record] ${scenario.id} started`);
  await step.run({ scenario, session, worldPath });
  await settled();
  await send({ type: "done", ok: true });
  process.exit(0);
} catch (err) {
  await settled();
  await fail(err);
}
