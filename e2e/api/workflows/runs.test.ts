import { env } from "@metis/e2e/lib/env";
import {
  appendLateArrival,
  deleteLateArrival,
  LATE_ARRIVAL_SUBJECT,
  LATE_ARRIVAL_WORKFLOW,
} from "@metis/e2e/lib/late-arrival";
import {
  AGENT_WORKFLOW,
  AI_WORKFLOW,
  APPROVAL_WORKFLOW,
  WEBHOOK_LABEL,
  WEBHOOK_SECRET_HEADER,
  WEBHOOK_WORKFLOW,
} from "@metis/e2e/lib/workflow-seeds";
import { ImapFlow } from "imapflow";
import { expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { APP } from "../../clients/harness";
import { uniqueName } from "../support/poll";
import { until } from "../support/poll";
import { ana, mailboxScope, scope } from "../support/session";
import {
  at,
  cel,
  edge,
  getRun,
  graphOf,
  labelMap,
  lit,
  node,
  nodeOf,
  restoreLabels,
  SETTLED,
  settledStatus,
  waitForRun,
  workflowNamed,
} from "../support/workflow";

const TRIAGE = "Triage with the decision model";

async function hitsDuring(path: string, run: () => Promise<void>): Promise<number> {
  const before = (await harness.hits()).length;
  await run();
  return (await harness.hits()).slice(before).filter((h) => h.path === path).length;
}

async function withImap<T>(run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: false,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

test(
  "retrying a run whose Ask completed and a later step failed does not ask again",
  async () => {
    const { rpc, account } = await ana();
    const before = await labelMap(rpc, account);
    const mailbox = mailboxScope(account);
    const [newest] = (
      await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
        ...mailbox,
        folder: "inbox",
        limit: 1,
      })
    ).emails;
    if (!newest) throw new Error("the inbox is empty");
    const triage = await workflowNamed(rpc, account, TRIAGE);
    const original = triage.graph;
    const failing = {
      ...original,
      nodes: [
        ...original.nodes.map((n) =>
          n.id === "todo"
            ? {
                id: n.id,
                step: "mail.archive",
                position: n.position,
                params: { message: cel("item") },
              }
            : n.id === "inbox"
              ? { ...n, params: { ...n.params, limit: lit(1) } }
              : n,
        ),
        { id: "every", step: "logic.merge", position: { x: 0, y: 600 }, params: {} },
      ],
      edges: [
        ...original.edges.filter((e) => !(e.source === "act" && e.target === "todo")),
        ...["yes", "no", "unsure"].map((handle, index) =>
          edge("act", "every", handle, `in:${index}`),
        ),
        edge("every", "todo"),
      ],
    };
    await rpc("workflows.update", {
      ...scope(account),
      id: triage.id,
      workflow: { name: triage.name, enabled: triage.enabled, graph: failing },
    });
    await withImap((client) => client.mailboxDelete("Archive"));
    try {
      const { runId } = await rpc<{ runId: string }>("workflows.run", {
        ...scope(account),
        id: triage.id,
      });
      const run = await until(
        () => getRun(rpc, account, runId),
        (r) =>
          JSON.stringify(nodeOf(r, "todo").items.map((i) => i.status)) ===
          JSON.stringify(["failed"]),
        { timeout: 60_000, what: "the archive step to fail" },
      );
      expect(SETTLED).not.toContain(run.status);
      expect(nodeOf(run, "ask").items).toHaveLength(1);
      expect(nodeOf(run, "ask").items.every((i) => i.status === "completed")).toBe(true);

      const decisions = await hitsDuring("/systemone", async () => {
        await withImap((client) => client.mailboxCreate("Archive"));
        const done = await waitForRun(rpc, account, runId);
        expect(done.status).toBe("completed");
      });
      expect(decisions).toBe(0);
    } finally {
      await withImap(async (client) => {
        const boxes = (await client.list()).map((b) => b.path);
        if (!boxes.includes("Archive")) await client.mailboxCreate("Archive");
      });
      const listed = async (folder: string) =>
        (
          await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
            ...mailbox,
            folder,
            limit: 100,
          })
        ).emails.find((e) => e.subject === newest.subject);
      const archived = await listed("archive");
      if (archived) {
        await rpc("mail.messages.restore", { ...mailbox, id: archived.id });
        const restored = await listed("inbox");
        const label = before[newest.id];
        if (restored && label && restored.id !== newest.id) {
          before[restored.id] = label;
          delete before[newest.id];
        }
      }
      await withImap(async (client) => {
        const lock = await client.getMailboxLock("Archive");
        try {
          const all = await client.search({ all: true }, { uid: true });
          if (all && all.length > 0) await client.messageMove(all, "INBOX", { uid: true });
        } finally {
          lock.release();
        }
      });
      await rpc("workflows.update", {
        ...scope(account),
        id: triage.id,
        workflow: {
          name: triage.name,
          enabled: triage.enabled,
          graph: original,
        },
      });
      await restoreLabels(rpc, account, before);
    }
  },
  4 * 60_000,
);

test(
  "new mail runs through a decision step",
  async () => {
    const { rpc, account } = await ana();
    const workflow = await workflowNamed(rpc, account, LATE_ARRIVAL_WORKFLOW);
    expect(workflow.enabled).toBe(false);
    const before = await labelMap(rpc, account);
    await rpc("workflows.toggle", {
      ...scope(account),
      id: workflow.id,
      enabled: true,
    });
    try {
      await until(
        async () => {
          const { workflows } = await rpc<{
            workflows: { id: string; sources: { baselined: boolean }[] }[];
          }>("workflows.list", scope(account));
          return workflows.find((w) => w.id === workflow.id)?.sources ?? [];
        },
        (sources) => sources.length > 0 && sources.every((s) => s.baselined),
        { timeout: 60_000, what: "the new-mail trigger to baseline" },
      );
      const runsOf = async () =>
        (
          await rpc<{ runs: { id: string; status: string }[] }>("workflows.runs", {
            ...scope(account),
            workflowId: workflow.id,
          })
        ).runs;
      const earlier = new Set((await runsOf()).map((r) => r.id));
      await appendLateArrival(env.imap);
      const runs = await until(
        runsOf,
        (list) => list.some((r) => !earlier.has(r.id) && SETTLED.includes(r.status)),
        { timeout: 120_000, interval: 2_000, what: "a settled new-mail run" },
      );
      const runId = runs.find((r) => !earlier.has(r.id) && SETTLED.includes(r.status))?.id ?? "";
      const run = await getRun(rpc, account, runId);
      expect(run.status).toBe("completed");
      const routed = ["todo", "fyi"].filter((id) => nodeOf(run, id).items.length > 0);
      expect(routed).toHaveLength(1);
      const [labelNode] = routed;
      const expected = labelNode === "todo" ? "action_required" : "updates";
      const { emails } = await rpc<{
        emails: { id: string; subject: string }[];
      }>("mail.messages.list", {
        ...mailboxScope(account),
        folder: "inbox",
        limit: 20,
      });
      const arrived = emails.find((e) => e.subject === LATE_ARRIVAL_SUBJECT);
      expect(arrived).toBeDefined();
      expect((await labelMap(rpc, account))[arrived?.id ?? ""]?.label).toBe(expected);
    } finally {
      await deleteLateArrival(env.imap);
      await rpc("workflows.toggle", {
        ...scope(account),
        id: workflow.id,
        enabled: false,
      });
      await restoreLabels(rpc, account, before);
    }
  },
  4 * 60_000,
);

test("request a run and cancel it, and the reported outcome matches the run", async () => {
  const { rpc, account } = await ana();
  const before = await labelMap(rpc, account);
  try {
    const workflow = await workflowNamed(rpc, account, "Label rebrand mail");
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    const outcome = await rpc<{
      state: string;
      status?: string;
      message: string;
    }>("workflows.cancelRun", { ...scope(account), runId });
    expect(outcome.message).toBeTruthy();
    const status = await settledStatus(rpc, account, runId);
    const allowed =
      outcome.state === "finished"
        ? [outcome.status]
        : outcome.state === "stopping"
          ? ["cancelled", "completed"]
          : ["cancelled"];
    expect(allowed).toContain(status);
  } finally {
    await restoreLabels(rpc, account, before);
  }
});

test(
  "an approval step holds the run until a member decides, then carries on",
  async () => {
    const { rpc, account } = await ana();
    const mailbox = mailboxScope(account);
    const workflow = await workflowNamed(rpc, account, APPROVAL_WORKFLOW);
    const [newest] = (
      await rpc<{ emails: { id: string; isStarred: boolean }[] }>("mail.messages.list", {
        ...mailbox,
        folder: "inbox",
        limit: 1,
      })
    ).emails;
    if (!newest) throw new Error("the inbox is empty");
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    try {
      await until(
        () => getRun(rpc, account, runId),
        (run) => run.status === "waiting",
        { timeout: 60_000, what: "the run to wait for approval" },
      );
      const { approvals } = await until(
        () =>
          rpc<{ approvals: { id: string; runId: string; request: string }[] }>(
            "workflows.approvals",
            scope(account),
          ),
        (list) => list.approvals.some((a) => a.runId === runId),
        { timeout: 30_000, what: "the approval to be listed" },
      );
      const approval = approvals.find((a) => a.runId === runId);
      expect(approval?.request).toBe("Star the newest message?");

      const detail = await rpc<{
        run: { waits: { id: string; kind: string; status: string; canDecide: boolean }[] };
      }>("workflows.getRun", { ...scope(account), runId });
      expect(detail.run.waits).toEqual([
        expect.objectContaining({
          id: approval?.id,
          kind: "approval",
          status: "open",
          canDecide: true,
        }),
      ]);

      await rpc("workflows.decide", {
        ...scope(account),
        waitId: approval?.id ?? "",
        decision: "approved",
        note: null,
      });
      const settled = await waitForRun(rpc, account, runId);
      expect(settled.status).toBe("completed");
      expect(nodeOf(settled, "star").items.map((i) => i.status)).toEqual(["completed"]);

      const again = await rpc<{ approvals: { runId: string }[] }>(
        "workflows.approvals",
        scope(account),
      );
      expect(again.approvals.some((a) => a.runId === runId)).toBe(false);
      const twice = await rpc("workflows.decide", {
        ...scope(account),
        waitId: approval?.id ?? "",
        decision: "denied",
        note: null,
      }).then(
        () => null,
        (err: unknown) => err,
      );
      expect(twice).toBeInstanceOf(Error);
    } finally {
      await rpc("workflows.cancelRun", { ...scope(account), runId }).catch(() => undefined);
      if (!newest.isStarred)
        await rpc("mail.messages.star", { ...mailbox, id: newest.id, starred: false });
    }
  },
  3 * 60_000,
);

test(
  "a webhook with the right secret starts a run on its body, and a wrong secret is refused",
  async () => {
    const { rpc, account } = await ana();
    const before = await labelMap(rpc, account);
    const workflow = await workflowNamed(rpc, account, WEBHOOK_WORKFLOW);
    const [endpoint] = workflow.endpoints;
    if (!endpoint) throw new Error("the webhook workflow has no endpoint");
    const { url, secret } = await rpc<{ url: string; secret: string }>("workflows.webhookSecret", {
      ...scope(account),
      id: workflow.id,
      endpointId: endpoint.endpointId,
    });
    const target = `${APP}${new URL(url).pathname}`;
    const post = (key: string) =>
      fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json", [WEBHOOK_SECRET_HEADER]: key },
        body: JSON.stringify({ subject: "Rebrand kickoff" }),
      });

    const refused = await post("not-the-secret");
    expect(refused.status).toBe(401);

    const runsOf = async () =>
      (
        await rpc<{ runs: { id: string; status: string }[] }>("workflows.runs", {
          ...scope(account),
          workflowId: workflow.id,
        })
      ).runs;
    const earlier = new Set((await runsOf()).map((r) => r.id));
    try {
      const accepted = await post(secret);
      expect(accepted.ok).toBe(true);
      const runs = await until(
        runsOf,
        (list) => list.some((r) => !earlier.has(r.id) && SETTLED.includes(r.status)),
        { timeout: 120_000, interval: 2_000, what: "the webhook run to settle" },
      );
      const runId = runs.find((r) => !earlier.has(r.id))?.id ?? "";
      const detail = await rpc<{
        run: {
          status: string;
          trigger: { source: string; event: { body?: { subject?: string } } };
        };
      }>("workflows.getRun", { ...scope(account), runId });
      expect(detail.run.status).toBe("completed");
      expect(detail.run.trigger.source).toBe("inbound");
      expect(detail.run.trigger.event.body?.subject).toBe("Rebrand kickoff");

      const { emails } = await rpc<{ emails: { id: string; subject: string }[] }>(
        "mail.messages.list",
        {
          ...mailboxScope(account),
          folder: "inbox",
          limit: 50,
        },
      );
      const kickoff = emails.find((e) => e.subject === "Rebrand kickoff");
      expect((await labelMap(rpc, account))[kickoff?.id ?? ""]?.label).toBe(WEBHOOK_LABEL);
    } finally {
      await restoreLabels(rpc, account, before);
    }
  },
  3 * 60_000,
);

test("a delay suspends the run as waiting, with its wake time, until it is cancelled", async () => {
  const { rpc, account } = await ana();
  const { directory } = await rpc<{ directory: { mailboxes: { id: string }[] } }>(
    "workflows.list",
    scope(account),
  );
  const mailboxId = directory.mailboxes[0]?.id ?? "";
  const graph = graphOf(
    [
      node("manual", "trigger.manual", at(0)),
      node("inbox", "mail.list", at(1), {
        mailbox: lit(mailboxId),
        folder: lit("inbox"),
        limit: lit(1),
      }),
      node("later", "flow.delay", at(2), { amount: lit(3), unit: lit("days") }),
      node("star", "mail.star", at(3), { message: cel("item"), starred: lit(true) }),
    ],
    [edge("manual", "inbox"), edge("inbox", "later"), edge("later", "star")],
  );
  const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
    ...scope(account),
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  try {
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    const run = await until(
      () => getRun(rpc, account, runId),
      (r) => r.status === "waiting",
      { timeout: 60_000, what: "the run to start waiting" },
    );
    expect(nodeOf(run, "star").items).toHaveLength(0);
    const detail = await rpc<{
      run: { dueAt: string; waits: { kind: string; wakeAt: string | null }[] };
    }>("workflows.getRun", { ...scope(account), runId });
    expect(new Date(detail.run.dueAt).getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);
    const outcome = await rpc<{ state: string }>("workflows.cancelRun", {
      ...scope(account),
      runId,
    });
    expect(outcome.state).toBe("cancelled");
    expect(await settledStatus(rpc, account, runId)).toBe("cancelled");
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: workflow.id });
  }
});

function assign(name: string, text: string) {
  return { name, value: cel(text) };
}

test("a loop runs its body per entry and collects the results back onto each item", async () => {
  const { rpc, account } = await ana();
  const mailboxId = (
    await rpc<{ directory: { mailboxes: { id: string; slug: string }[] } }>(
      "workflows.list",
      scope(account),
    )
  ).directory.mailboxes.find((m) => m.slug === account.mailboxSlug)?.id;
  if (!mailboxId) throw new Error("the mailbox is not in the workflow directory");
  const graph = graphOf(
    [
      node("manual", "trigger.manual", at(0)),
      node("inbox", "mail.list", at(1), {
        mailbox: lit(mailboxId),
        folder: lit("inbox"),
        limit: lit(3),
      }),
      node("each", "flow.loop", at(2), { list: cel("[item.subject, item.from]") }),
      node("part", "logic.set", at(3), { fields: lit([assign("text", "item")]) }),
      node("collect", "flow.endLoop", at(4)),
      node("count", "logic.set", at(5), {
        fields: lit([assign("n", "item.count"), assign("subject", "steps.inbox.subject")]),
      }),
    ],
    [
      edge("manual", "inbox"),
      edge("inbox", "each"),
      edge("each", "part"),
      edge("part", "collect"),
      edge("collect", "count"),
    ],
  );
  const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
    ...scope(account),
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  try {
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    const run = await waitForRun(rpc, account, runId);
    expect(run.status).toBe("completed");
    expect(nodeOf(run, "part").items).toHaveLength(6);
    const detail = await rpc<{
      run: {
        nodes: {
          nodeId: string;
          items: { status: string; output: { value: { n: number; subject: string } }[] | null }[];
        }[];
      };
    }>("workflows.getRun", { ...scope(account), runId });
    const counted = detail.run.nodes.find((n) => n.nodeId === "count")?.items ?? [];
    expect(counted).toHaveLength(3);
    for (const item of counted) {
      expect(item.status).toBe("completed");
      expect(item.output?.[0]?.value.n).toBe(2);
      expect(item.output?.[0]?.value.subject).toBeTruthy();
    }
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: workflow.id });
  }
});

test("a dispatch step that ends without a receipt can be closed by a person", async () => {
  const { rpc, account } = await ana();
  const driveSlug = account.driveSlugs.webdav;
  if (!driveSlug) throw new Error("no webdav drive is enrolled");
  const driveId = (
    await rpc<{ directory: { drives: { id: string; slug: string }[] } }>(
      "workflows.list",
      scope(account),
    )
  ).directory.drives.find((d) => d.slug === driveSlug)?.id;
  if (!driveId) throw new Error("the drive is not in the workflow directory");
  const graph = graphOf(
    [
      node("manual", "trigger.manual", at(0)),
      node("write", "drive.write", at(1), {
        drive: lit(driveId),
        folder: lit(""),
        name: lit(`${uniqueName()}.txt`),
        contents: cel(
          'dyn({"id": "gone", "name": "gone.txt", "mimeType": "text/plain", "size": 1})',
        ),
      }),
    ],
    [edge("manual", "write")],
  );
  const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
    ...scope(account),
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  try {
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    await waitForRun(rpc, account, runId);
    const stepRun = async () =>
      (
        await rpc<{
          run: {
            nodes: {
              nodeId: string;
              items: {
                id: string;
                status: string;
                resolvable: boolean;
                resolution: { outcome: string; reason: string | null } | null;
              }[];
            }[];
          };
        }>("workflows.getRun", { ...scope(account), runId })
      ).run.nodes.find((n) => n.nodeId === "write")?.items[0];
    const unknown = await stepRun();
    expect(unknown?.status).toBe("unknown");
    expect(unknown?.resolvable).toBe(true);
    const stepRunId = unknown?.id ?? "";

    const view = await rpc<{ state: string; reconcilable?: boolean; candidates?: unknown[] }>(
      "workflows.unconfirmedStep",
      { ...scope(account), runId, stepRunId },
    );
    expect(view.state).toBe("unconfirmed");
    expect(view.reconcilable).toBe(true);
    expect(view.candidates).toEqual([]);

    const closed = await rpc<{ message: string }>("workflows.resolveStep", {
      ...scope(account),
      runId,
      stepRunId,
      decision: { outcome: "closed", reason: "not-delivered", note: null },
    });
    expect(closed.message).toMatch(/^Closed/);
    const after = await stepRun();
    expect(after?.resolvable).toBe(false);
    expect(after?.resolution).toMatchObject({ outcome: "closed", reason: "not-delivered" });
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: workflow.id });
  }
});

test("the seeded AI and agent runs completed every AI step", async () => {
  const { rpc, account } = await ana();
  const seededRun = async (name: string) => {
    const workflow = await workflowNamed(rpc, account, name);
    const { runs } = await rpc<{ runs: { id: string }[] }>("workflows.runs", {
      ...scope(account),
      workflowIds: [workflow.id],
      limit: 100,
    });
    for (const { id } of runs) {
      const run = await getRun(rpc, account, id);
      const detail = await rpc<{ run: { trigger: { source: string } } }>("workflows.getRun", {
        ...scope(account),
        runId: id,
      });
      if (detail.run.trigger.source === "manual") return run;
    }
    throw new Error(`"${name}" has no seeded run`);
  };

  const run = await seededRun(AI_WORKFLOW);
  expect(run.status).toBe("completed");
  for (const id of ["summary", "facts", "sort"]) {
    expect(
      nodeOf(run, id).items.map((i) => i.status),
      id,
    ).toEqual(["completed"]);
  }
  const answered = [...nodeOf(run, "reply").items, ...nodeOf(run, "other").items];
  expect(answered.map((i) => i.status)).toEqual(["completed"]);

  const agent = await seededRun(AGENT_WORKFLOW);
  expect(agent.status).toBe("completed");
  expect(nodeOf(agent, "agent").items.map((i) => i.status)).toEqual(["completed"]);
});
