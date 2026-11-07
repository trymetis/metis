import "server-only";
import type { ResolvedCalendar } from "@/calendar/aggregate";
import type { ResolvedAddressBook } from "@/contacts/aggregate";
import type { ResolvedDrive } from "@/drive/aggregate";
import type { MailHandle } from "@/ops/values";
import type { DraftPayload } from "@/types/mail";

import type { BackgroundPrincipal } from "../authorization";
import type { Binding } from "../expr";
import type { Item, StepReceipt, WaitState } from "../runtime";
import type { GraphNode, WaitKind, WorkflowGraph } from "../schema";
import type { ResourceKind } from "../steps/types";
import type { DefinitionRow, WaitRow } from "../store";
import type { ValueType } from "../values";

export type ExecutionMode = "live" | "test" | "policy";

export class BlockedError extends Error {}

export interface BlobRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChildRun {
  runId: string;
  status: string;
  output: unknown;
  error: string | null;
}

export interface StepCtx {
  mode: ExecutionMode;
  now: Date;
  runId: string | null;
  stepRunId: string | null;
  signal?: AbortSignal;
  deadline?: number;
  principal: BackgroundPrincipal;
  definition: DefinitionRow;
  graph: WorkflowGraph;
  node: GraphNode;
  trigger: unknown;
  state: WaitState | null;
  wait: WaitRow | null;
  timezone: string;
  mailbox(mailboxId: string): Promise<MailHandle & { linkId: string | null }>;
  calendar(accountId: string): Promise<ResolvedCalendar>;
  drive(driveId: string): Promise<ResolvedDrive>;
  addressBook(addressBookId: string): Promise<ResolvedAddressBook>;
  requireAi(resources: { kind: ResourceKind; id: string }[]): Promise<void>;
  putBlob(name: string, mimeType: string, data: Buffer): Promise<BlobRef>;
  getBlob(id: string): Promise<{ name: string; mimeType: string; data: Buffer }>;
  draftPayload(): Promise<DraftPayload | null>;
  evaluate(binding: Binding, expected: ValueType): unknown;
  evaluateCel(cel: string): unknown;
  startChild(opts: {
    workflowId: string;
    inputs: Record<string, unknown>;
    key: string;
  }): Promise<string>;
  childRuns(runIds: string[]): Promise<ChildRun[]>;
  usage(entry: {
    feature: "workflow-decision" | "workflow-ai" | "workflow-agent";
    provider: string;
    model: string;
    usage: unknown;
  }): void;
}

export interface Emission {
  handle?: string;
  result: unknown;
  key?: string;
}

export type StepResult =
  | {
      kind: "emit";
      emits: Emission[];
      detail?: string;
      receipt?: StepReceipt;
    }
  | {
      kind: "wait";
      waitKind: WaitKind;
      until: Date | null;
      deadline: Date | null;
      state: WaitState;
      detail: string;
      approvers?: string[];
      request?: string;
      childRunIds?: string[];
    };

export type Params = Record<string, unknown>;

export interface Runner {
  run(ctx: StepCtx, params: Params, item: Item): Promise<StepResult>;
  expect?(params: Params): Record<string, unknown>;
  preview?(ctx: StepCtx, params: Params, item: Item): Promise<StepResult> | StepResult;
}

export function emit(result: unknown, detail?: string, receipt?: StepReceipt): StepResult {
  return { kind: "emit", emits: [{ result }], detail, receipt };
}

export function emitOn(handle: string, result: unknown, detail?: string): StepResult {
  return { kind: "emit", emits: [{ handle, result }], detail };
}

export function nothing(detail: string): StepResult {
  return { kind: "emit", emits: [], detail };
}

export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function text(params: Params, name: string): string {
  return str(params[name]);
}

export function numberOf(params: Params, name: string, fallback: number): number {
  const value = params[name];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function boolOf(params: Params, name: string, fallback: boolean): boolean {
  const value = params[name];
  return typeof value === "boolean" ? value : fallback;
}

export function list(params: Params, name: string): string[] {
  const value = params[name];
  if (Array.isArray(value))
    return value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export function dateOf(params: Params, name: string): Date | null {
  const value = params[name];
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
