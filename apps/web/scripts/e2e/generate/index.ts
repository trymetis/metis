import { env } from "@metis/e2e/lib/env";

import { applyScratchDatabase, createScratchDatabase } from "../scratch-db";

const scratch = await createScratchDatabase(env.generateDir);
applyScratchDatabase(scratch);

const { createAccount, createMember } = await import("./account");
const { connectResources } = await import("./connections");
const { seedWorkspaceState } = await import("./workspace-state");
const { seedExportRecords } = await import("./export-records");
const { seedWorkflows } = await import("./workflows");
const { seedMcpClients } = await import("./mcp");
const { writeSeed } = await import("./write");

const account = await createAccount();
const member = await createMember();
const resources = await connectResources(account);
await seedWorkspaceState(account, resources);
await seedExportRecords();
await seedWorkflows(account, resources);
const mcp = await seedMcpClients(account, member);
await writeSeed(scratch.app, account, resources, member, mcp);
process.exit(0);
