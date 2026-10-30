import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { until, uniqueName } from "../support/poll";
import { ana, mailboxScope, scope } from "../support/session";
import {
  at,
  cel,
  edge,
  getRun,
  type Graph,
  type GraphEdge,
  type GraphNode,
  graphOf,
  labelMap,
  lit,
  node,
  nodeOf,
  restoreLabels,
  SETTLED,
  waitForRun,
} from "../support/workflow";

interface DirectoryEntry {
  id: string;
  slug: string;
  email: string;
}

interface Email {
  id: string;
  subject: string;
  from: string;
  isStarred: boolean;
}

interface TestResult {
  status: string;
  error: string | null;
  event: Record<string, unknown> | null;
  steps: { nodeId: string; status: string; count: number; detail: string | null }[];
  items: {
    nodeId: string;
    status: string;
    title: string | null;
    subtitle: string | null;
    outputs: string[];
    detail: string | null;
    error: string | null;
    input: unknown;
    result: unknown;
  }[];
}

function inbox(mailboxId: string, step = 1, limit = 50): GraphNode {
  return node("inbox", "mail.list", at(step), {
    mailbox: lit(mailboxId),
    folder: lit("inbox"),
    limit: lit(limit),
  });
}

function subjectContains(id: string, value: string, step = 2): GraphNode {
  return node(id, "logic.filter", at(step), {
    condition: cel(`lower(item.subject).contains(${JSON.stringify(value.toLowerCase())})`),
  });
}

function action(
  id: string,
  step: string,
  column: number,
  params: GraphNode["params"] = {},
  extra: Partial<GraphNode> = {},
) {
  return node(id, step, at(column), { message: cel("item"), ...params }, extra);
}

function manualGraph(mailboxId: string, tail: GraphNode[], tailEdges: GraphEdge[]): Graph {
  return graphOf(
    [node("manual", "trigger.manual", at(0)), inbox(mailboxId), ...tail],
    [edge("manual", "inbox"), ...tailEdges],
  );
}

async function primaryMailbox(rpc: Rpc, account: Account): Promise<DirectoryEntry> {
  const { directory } = await rpc<{ directory: { mailboxes: DirectoryEntry[] } }>(
    "workflows.list",
    scope(account),
  );
  const found =
    directory.mailboxes.find((m) => m.slug === account.mailboxSlug) ?? directory.mailboxes[0];
  if (!found) throw new Error("the workspace has no mailbox");
  return found;
}

async function inboxEmails(rpc: Rpc, account: Account): Promise<Email[]> {
  const { emails } = await rpc<{ emails: Email[] }>("mail.messages.list", {
    ...mailboxScope(account),
    folder: "inbox",
    limit: 50,
  });
  return emails;
}

function bySubject(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

async function withWorkflow<T>(
  rpc: Rpc,
  account: Account,
  workflow: { name: string; enabled: boolean; graph: Graph },
  run: (created: { id: string; revision: number; graph: Graph }) => Promise<T>,
): Promise<T> {
  const { workflow: created } = await rpc<{
    workflow: { id: string; revision: number; graph: Graph };
  }>("workflows.create", { ...scope(account), workflow });
  try {
    return await run(created);
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: created.id });
  }
}

async function refusal(rpc: Rpc, account: Account, graph: Graph): Promise<RpcError> {
  return rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: { name: uniqueName(), enabled: false, graph },
    }),
  );
}

test("a graph without a trigger is refused with its validation message", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const err = await refusal(rpc, account, graphOf([inbox(box.id)], []));
  expect(err.status).toBe(400);
  expect(err.message).toBe("Add a trigger to start this workflow");
});

test("a skip flag on a step that changes nothing is refused", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.id,
    [{ ...subjectContains("rebrand", "Rebrand"), skip: true }],
    [edge("inbox", "rebrand")],
  );
  const err = await refusal(rpc, account, graph);
  expect(err.message).toBe("Only a step that changes something can be skipped");
});

test("an unknown time zone and a bad cron expression are refused", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const schedule = (cron: string, timezone: string) =>
    graphOf(
      [
        node("daily", "trigger.schedule", at(0), { cron: lit(cron), timezone: lit(timezone) }),
        inbox(box.id),
      ],
      [edge("daily", "inbox")],
    );
  const zone = await refusal(rpc, account, schedule("0 9 * * *", "Mars/Base"));
  expect(zone.message).toBe("Pick a valid time zone");
  const cron = await refusal(rpc, account, schedule("every day", "Etc/UTC"));
  expect(cron.message).toBe("Use a five-field cron expression");
});

test("a mailbox outside the workspace is refused", async () => {
  const { rpc, account } = await ana();
  const err = await refusal(rpc, account, manualGraph("no-such-mailbox", [], []));
  expect(err.message).toBe("That mailbox is not in this workspace");
});

test("an expression that does not type-check is refused with the setting it is in", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const notBoolean = await refusal(
    rpc,
    account,
    manualGraph(
      box.id,
      [node("check", "logic.filter", at(2), { condition: cel("item.subject") })],
      [edge("inbox", "check")],
    ),
  );
  expect(notBoolean.message).toMatch(/^Keep when: /);
  const unknownField = await refusal(
    rpc,
    account,
    manualGraph(
      box.id,
      [node("check", "logic.filter", at(2), { condition: cel("item.nonsense == 1") })],
      [edge("inbox", "check")],
    ),
  );
  expect(unknownField.message).toMatch(/^Keep when: /);
});

test("step titles round-trip through create, list and update, and an update bumps the revision", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.id,
    [{ ...subjectContains("rebrand", "Rebrand"), title: "Is it about the rebrand?" }],
    [edge("inbox", "rebrand")],
  );
  await withWorkflow(rpc, account, { name: uniqueName(), enabled: false, graph }, async (wf) => {
    const listed = await rpc<{ workflows: { id: string; graph: Graph }[] }>(
      "workflows.list",
      scope(account),
    );
    const found = listed.workflows.find((w) => w.id === wf.id);
    expect(found?.graph.nodes.find((n) => n.id === "rebrand")?.title).toBe(
      "Is it about the rebrand?",
    );

    const renamed = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "rebrand" ? { ...n, title: "Rebrand mail" } : n)),
    };
    const { workflow: updated } = await rpc<{ workflow: { revision: number; graph: Graph } }>(
      "workflows.update",
      {
        ...scope(account),
        id: wf.id,
        workflow: { name: uniqueName(), enabled: false, graph: renamed },
      },
    );
    expect(updated.revision).toBeGreaterThan(wf.revision);
    expect(updated.graph.nodes.find((n) => n.id === "rebrand")?.title).toBe("Rebrand mail");

    const { revisions } = await rpc<{ revisions: { revision: number; graph: Graph }[] }>(
      "workflows.revisions",
      { ...scope(account), id: wf.id },
    );
    expect(revisions.map((r) => r.revision)).toEqual(
      expect.arrayContaining([wf.revision, updated.revision]),
    );
    const first = revisions.find((r) => r.revision === wf.revision);
    expect(first?.graph.nodes.find((n) => n.id === "rebrand")?.title).toBe(
      "Is it about the rebrand?",
    );
  });
});

test("a skipped action passes its mail straight on, and the run records the step as skipped", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const before = await labelMap(rpc, account);
  const graph = manualGraph(
    box.id,
    [
      subjectContains("order", "order"),
      action("archive", "mail.archive", 3, {}, { skip: true }),
      action("label", "mail.label", 4, { label: lit("work") }),
    ],
    [edge("inbox", "order"), edge("order", "archive"), edge("archive", "label")],
  );
  try {
    await withWorkflow(rpc, account, { name: uniqueName(), enabled: true, graph }, async (wf) => {
      const { runId } = await rpc<{ runId: string }>("workflows.run", {
        ...scope(account),
        id: wf.id,
      });
      const run = await waitForRun(rpc, account, runId);
      expect(run.status).toBe("completed");
      const detail = await rpc<{
        run: { nodes: { nodeId: string; lines: { status: string; detail: string | null }[] }[] };
      }>("workflows.getRun", { ...scope(account), runId });
      const archive = detail.run.nodes.find((n) => n.nodeId === "archive");
      expect(archive?.lines.map((l) => l.status)).toEqual(["skipped"]);
      expect(archive?.lines[0]?.detail).toBe("this step is skipped in the editor");
      expect(nodeOf(run, "label").items.length).toBeGreaterThan(0);

      const order = (await inboxEmails(rpc, account)).find((e) =>
        e.subject.includes("Your order A-42"),
      );
      expect(order, "the skipped archive left the order in the inbox").toBeDefined();
      expect((await labelMap(rpc, account))[order?.id ?? ""]?.label).toBe("work");
    });
  } finally {
    await restoreLabels(rpc, account, before);
  }
});

test("a test run of an unsaved graph reports what each step would do and changes nothing", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const labelsBefore = await labelMap(rpc, account);
  const emailsBefore = await inboxEmails(rpc, account);
  const { runs: runsBefore } = await rpc<{ runs: unknown[] }>("workflows.runs", {
    ...scope(account),
    limit: 100,
  });
  const graph = manualGraph(
    box.id,
    [
      subjectContains("rebrand", "Rebrand"),
      action("label", "mail.label", 3, { label: lit("work") }),
      action("star", "mail.star", 4, { starred: lit(true) }),
    ],
    [edge("inbox", "rebrand"), edge("rebrand", "label"), edge("label", "star")],
  );

  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });

  expect(result.status).toBe("completed");
  expect(result.error).toBeNull();
  const rebrand = emailsBefore.filter((e) => e.subject.toLowerCase().includes("rebrand"));
  expect(rebrand.length).toBeGreaterThan(0);

  const filtered = result.items.filter((i) => i.nodeId === "rebrand");
  expect(filtered).toHaveLength(emailsBefore.length);
  expect(filtered.filter((i) => i.outputs.includes("out"))).toHaveLength(rebrand.length);

  for (const id of ["label", "star"]) {
    const items = result.items.filter((i) => i.nodeId === id);
    expect(items.map((i) => i.title).toSorted(bySubject), id).toEqual(
      rebrand.map((e) => e.subject).toSorted(bySubject),
    );
    for (const item of items) {
      expect(item.status).toBe("completed");
      expect(item.detail).toBe("would change this message");
      expect(item.outputs).toEqual(["out"]);
    }
  }

  expect(await labelMap(rpc, account)).toEqual(labelsBefore);
  const emailsAfter = await inboxEmails(rpc, account);
  expect(emailsAfter.map((e) => [e.id, e.isStarred])).toEqual(
    emailsBefore.map((e) => [e.id, e.isStarred]),
  );
  const { runs: runsAfter } = await rpc<{ runs: unknown[] }>("workflows.runs", {
    ...scope(account),
    limit: 100,
  });
  expect(runsAfter).toHaveLength(runsBefore.length);
});

test("a test run follows a skipped action into the step after it", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.id,
    [
      subjectContains("order", "order"),
      action("trash", "mail.trash", 3, {}, { skip: true }),
      action("label", "mail.label", 4, { label: lit("transactions") }),
    ],
    [edge("inbox", "order"), edge("order", "trash"), edge("trash", "label")],
  );
  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });
  expect(result.status).toBe("completed");
  const trash = result.items.filter((i) => i.nodeId === "trash");
  expect(trash.length).toBeGreaterThan(0);
  for (const item of trash) expect(item.status).toBe("skipped");
  expect(result.items.filter((i) => i.nodeId === "label").map((i) => i.title)).toEqual(
    trash.map((i) => i.title),
  );
});

test("a test run from a received-mail trigger runs on the sample that was picked", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = graphOf(
    [
      node("arrives", "trigger.mail.received", at(0), {
        mailbox: lit(box.id),
        folder: lit("inbox"),
      }),
      node("raj", "logic.filter", at(1), { condition: cel('lower(item.from).contains("raj@")') }),
      action("label", "mail.label", 2, { label: lit("work") }),
    ],
    [edge("arrives", "raj"), edge("raj", "label")],
  );
  const { samples } = await rpc<{ samples: { id: string; title: string; subtitle: string }[] }>(
    "workflows.testSamples",
    { ...scope(account), graph, triggerNodeId: "arrives" },
  );
  const kickoff = samples.find((s) => s.title === "Rebrand kickoff");
  const order = samples.find((s) => s.title.includes("Your order A-42"));
  expect(kickoff).toBeDefined();
  expect(order).toBeDefined();

  const runOn = (sampleId: string) =>
    rpc<TestResult>("workflows.test", {
      ...scope(account),
      graph,
      triggerNodeId: "arrives",
      sampleId,
    });

  const matched = await runOn(kickoff?.id ?? "");
  expect(matched.status).toBe("completed");
  expect(matched.event?.subject).toBe("Rebrand kickoff");
  expect(matched.items.find((i) => i.nodeId === "raj")?.outputs).toEqual(["out"]);
  expect(matched.items.filter((i) => i.nodeId === "label")).toHaveLength(1);

  const missed = await runOn(order?.id ?? "");
  expect(String(missed.event?.subject)).toContain("Your order A-42");
  expect(missed.items.find((i) => i.nodeId === "raj")?.outputs).toEqual([]);
  expect(missed.items.filter((i) => i.nodeId === "label")).toHaveLength(0);
});

test("a test run with a pasted event and with a pinned sample uses that event", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const [newest] = await inboxEmails(rpc, account);
  if (!newest) throw new Error("the inbox is empty");
  const graph = graphOf(
    [
      node("arrives", "trigger.mail.received", at(0), {
        mailbox: lit(box.id),
        folder: lit("inbox"),
      }),
      node("shape", "logic.set", at(1), {
        fields: lit([
          {
            name: "headline",
            value: { kind: "template", text: "{{ item.subject }} from {{ item.from }}" },
          },
        ]),
      }),
    ],
    [edge("arrives", "shape")],
  );
  const event = { ...newest, subject: "Pasted subject", from: "pasted@example.com" };
  const pasted = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "arrives",
    event,
  });
  expect(pasted.status).toBe("completed");
  const shaped = pasted.items.find((i) => i.nodeId === "shape");
  expect(shaped?.result).toMatchObject({ headline: "Pasted subject from pasted@example.com" });

  await withWorkflow(rpc, account, { name: uniqueName(), enabled: false, graph }, async (wf) => {
    await rpc("workflows.pinSample", {
      ...scope(account),
      id: wf.id,
      triggerNodeId: "arrives",
      event,
    });
    const { samples } = await rpc<{ samples: Record<string, { subject?: string }> }>(
      "workflows.samples",
      {
        ...scope(account),
        id: wf.id,
      },
    );
    expect(samples.arrives?.subject).toBe("Pasted subject");
    await rpc("workflows.pinSample", {
      ...scope(account),
      id: wf.id,
      triggerNodeId: "arrives",
      event: null,
    });
    const cleared = await rpc<{ samples: Record<string, unknown> }>("workflows.samples", {
      ...scope(account),
      id: wf.id,
    });
    expect(cleared.samples.arrives).toBeUndefined();
  });
});

test("a Switch routes each item to the first case it matches, and the rest to Else", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const emails = await inboxEmails(rpc, account);
  const graph = manualGraph(
    box.id,
    [
      node("route", "logic.switch", at(2), {
        cases: lit([
          { id: "rebrand", name: "Rebrand", when: 'lower(item.subject).contains("rebrand")' },
          { id: "order", name: "Orders", when: 'lower(item.subject).contains("order")' },
        ]),
      }),
    ],
    [edge("inbox", "route")],
  );
  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });
  expect(result.status).toBe("completed");
  const routed = result.items.filter((i) => i.nodeId === "route");
  expect(routed).toHaveLength(emails.length);
  const rebrand = emails.filter((e) => e.subject.toLowerCase().includes("rebrand"));
  const orders = emails.filter(
    (e) =>
      !e.subject.toLowerCase().includes("rebrand") && e.subject.toLowerCase().includes("order"),
  );
  expect(routed.filter((i) => i.outputs.includes("case:rebrand"))).toHaveLength(rebrand.length);
  expect(routed.filter((i) => i.outputs.includes("case:order"))).toHaveLength(orders.length);
  expect(routed.filter((i) => i.outputs.includes("else"))).toHaveLength(
    emails.length - rebrand.length - orders.length,
  );
});

test("a failing step set to branch on error routes the item to its Error output", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = graphOf(
    [
      node("manual", "trigger.manual", at(0)),
      node(
        "fetch",
        "mail.get",
        at(1),
        { mailbox: lit(box.id), id: lit("no-such-message") },
        { onError: "branch" },
      ),
      node("note", "logic.set", at(2), {
        fields: lit([{ name: "failed", value: { kind: "expr", cel: "true" } }]),
      }),
    ],
    [edge("manual", "fetch"), edge("fetch", "note", "error")],
  );
  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });
  expect(result.status).toBe("completed");
  const fetched = result.items.find((i) => i.nodeId === "fetch");
  expect(fetched?.outputs).toEqual(["error"]);
  expect(fetched?.error).toBeTruthy();
  expect(result.items.find((i) => i.nodeId === "note")?.result).toMatchObject({ failed: true });
});

test("a test run refuses an invalid graph, a trigger with no event and a mailbox outside the workspace", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);

  const noTrigger = await rejection(
    rpc("workflows.test", {
      ...scope(account),
      graph: graphOf([inbox(box.id)], []),
      triggerNodeId: "inbox",
    }),
  );
  expect(noTrigger.message).toBe("Add a trigger to start this workflow");

  const beforeSend = await rejection(
    rpc("workflows.test", {
      ...scope(account),
      graph: graphOf(
        [
          node("sending", "trigger.mail.beforeSend", at(0)),
          node("bcc", "mail.addBcc", at(1), { address: lit("archive@demo.trymetis.email") }),
        ],
        [edge("sending", "bcc")],
      ),
      triggerNodeId: "sending",
    }),
  );
  expect(beforeSend.message).toBe("Pin a sample event to test this trigger");

  const outside = graphOf(
    [
      node("arrives", "trigger.mail.received", at(0), {
        mailbox: lit("no-such-mailbox"),
        folder: lit("inbox"),
      }),
    ],
    [],
  );
  const samples = await rejection(
    rpc("workflows.testSamples", { ...scope(account), graph: outside, triggerNodeId: "arrives" }),
  );
  expect(samples.message).toBe("That mailbox is not in this workspace");
});

test("a test run validates and runs the graph it is sent, not the saved one", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const saved = manualGraph(box.id, [subjectContains("cond", "Rebrand")], [edge("inbox", "cond")]);
  await withWorkflow(
    rpc,
    account,
    { name: uniqueName(), enabled: false, graph: saved },
    async () => {
      const edited = manualGraph(
        box.id,
        [subjectContains("cond", "1,250.00 debited")],
        [edge("inbox", "cond")],
      );
      const result = await rpc<TestResult>("workflows.test", {
        ...scope(account),
        graph: edited,
        triggerNodeId: "manual",
      });
      const matched = result.items.filter((i) => i.nodeId === "cond" && i.outputs.includes("out"));
      expect(matched.map((i) => i.title)).toEqual([expect.stringContaining("1,250.00 debited")]);
    },
  );
});

test(
  "a schedule trigger fires on its own and the run reports the schedule as its source",
  async () => {
    const { rpc, account } = await ana();
    const box = await primaryMailbox(rpc, account);
    const graph = graphOf(
      [
        node("minutely", "trigger.schedule", at(0), {
          cron: lit("* * * * *"),
          timezone: lit("Etc/UTC"),
        }),
        inbox(box.id),
        subjectContains("none", "e2e-subject-that-matches-nothing"),
        action("star", "mail.star", 3, { starred: lit(true) }),
      ],
      [edge("minutely", "inbox"), edge("inbox", "none"), edge("none", "star")],
    );
    await withWorkflow(rpc, account, { name: uniqueName(), enabled: true, graph }, async (wf) => {
      const runs = await until(
        async () =>
          (
            await rpc<{ runs: { id: string; status: string }[] }>("workflows.runs", {
              ...scope(account),
              workflowId: wf.id,
            })
          ).runs,
        (list) => list.some((r) => SETTLED.includes(r.status)),
        { timeout: 180_000, interval: 3_000, what: "a scheduled run to settle" },
      );
      const settled = runs.find((r) => SETTLED.includes(r.status));
      const run = await getRun(rpc, account, settled?.id ?? "");
      expect(run.status).toBe("completed");
      const detail = await rpc<{ run: { trigger: { source: string; firedFor: string | null } } }>(
        "workflows.getRun",
        { ...scope(account), runId: run.id },
      );
      expect(detail.run.trigger.source).toBe("schedule");
      expect(detail.run.trigger.firedFor).not.toBeNull();
      expect(nodeOf(run, "inbox").items.length).toBeGreaterThan(0);
      expect(nodeOf(run, "star").items).toHaveLength(0);
    });
  },
  4 * 60_000,
);
