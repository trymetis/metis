import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { boxSchema } from "./box.ts";
import { stepSchema } from "./steps.ts";

export const LISTS_DIR = join(import.meta.dirname, "..", "lists");

export const CONSENT_SHOT = "mcp/consent";

export type Target = "all" | "docs" | "www";
export type Site = "docs" | "www";

export const wwwShotSchema = z.strictObject({
  name: z.string(),
  focus: z
    .union([z.string(), z.array(z.string()), boxSchema])
    .nullable()
    .optional(),
  steps: z.array(stepSchema).optional(),
});
export type WwwShot = z.infer<typeof wwwShotSchema>;

const pageFields = {
  name: z.string(),
  path: z.string(),
  signedOut: z.boolean().optional(),
  maintenance: z.boolean().optional(),
  observer: z.boolean().optional(),
  invite: z
    .strictObject({
      email: z.string(),
      workspace: z.boolean().optional(),
      role: z.enum(["admin", "observer"]).optional(),
    })
    .optional(),
  seededWeek: z.boolean().optional(),
  steps: z.array(stepSchema).optional(),
  element: z.union([z.string(), z.array(z.string())]).optional(),
  pad: z.number().optional(),
  clip: boxSchema.optional(),
  fullPage: z.boolean().optional(),
  viewport: z.strictObject({ width: z.number(), height: z.number() }).optional(),
};

function wwwPage<T extends "all" | "www">(target: T) {
  return z
    .strictObject({ ...pageFields, target: z.literal(target), www: z.array(wwwShotSchema).min(1) })
    .refine((entry) => !entry.invite && !entry.observer && !entry.maintenance, {
      message: "www cannot capture invite, Observer or maintenance entries",
      path: ["www"],
    });
}

export const pageEntrySchema = z.discriminatedUnion("target", [
  z.strictObject({ ...pageFields, target: z.literal("docs") }),
  wwwPage("all"),
  wwwPage("www"),
]);
export type PageEntry = z.infer<typeof pageEntrySchema>;

export const terminalStepSchema = z.union([
  z.strictObject({ type: z.string() }),
  z.strictObject({ answer: z.string() }),
  z.strictObject({ press: z.string() }),
  z.strictObject({
    waitFor: z.string(),
    ignoreCase: z.boolean().optional(),
    timeout: z.number().optional(),
  }),
  z.strictObject({ waitForPrompt: z.literal(true), timeout: z.number().optional() }),
  z.strictObject({ settle: z.number() }),
  z.strictObject({ hidden: z.string() }),
  z.strictObject({ wait: z.number() }),
]);
export type TerminalStep = z.infer<typeof terminalStepSchema>;

const terminalFields = {
  name: z.string(),
  rows: z.number().optional(),
  cols: z.number().optional(),
  steps: z.array(terminalStepSchema),
};

export const terminalEntrySchema = z.discriminatedUnion("terminal", [
  z.strictObject({
    ...terminalFields,
    terminal: z.literal("cli-host"),
    target: z.literal("docs"),
    prompt: z
      .string()
      .regex(/^[\w.-]+@[\w.-]+$/)
      .optional(),
  }),
  z.strictObject({
    ...terminalFields,
    terminal: z.literal("claude-code"),
    target: z.literal("www"),
  }),
]);
export type TerminalEntry = z.infer<typeof terminalEntrySchema>;

export interface Lists {
  pages: PageEntry[];
  terminals: TerminalEntry[];
}

function countNames(names: Map<string, number>, name: string) {
  names.set(name, (names.get(name) ?? 0) + 1);
}

export const listsSchema = z
  .strictObject({
    pages: z.record(z.string(), z.array(pageEntrySchema)),
    terminals: z.record(z.string(), z.array(terminalEntrySchema)),
  })
  .superRefine((lists, ctx) => {
    const sites: Record<Site, Map<string, number>> = {
      docs: new Map(),
      www: new Map([[CONSENT_SHOT, 1]]),
    };
    for (const entry of Object.values(lists.pages).flat()) {
      if (entry.target !== "www") countNames(sites.docs, entry.name);
      if (entry.target !== "docs") for (const shot of entry.www) countNames(sites.www, shot.name);
    }
    for (const entry of Object.values(lists.terminals).flat())
      countNames(sites[entry.target], entry.name);
    for (const [site, names] of Object.entries(sites))
      for (const [name, n] of names)
        if (n > 1)
          ctx.addIssue({
            code: "custom",
            message: `${name}: ${n} ${site} screenshots share this name`,
          });
  });

function readFolder(dir: string): Record<string, unknown> {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .toSorted()
      .map((file) => [file, JSON.parse(readFileSync(join(dir, file), "utf8"))]),
  );
}

export function readLists(dir = LISTS_DIR): Lists {
  const parsed = listsSchema.safeParse({
    pages: readFolder(join(dir, "pages")),
    terminals: readFolder(join(dir, "terminals")),
  });
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  return {
    pages: Object.values(parsed.data.pages).flat(),
    terminals: Object.values(parsed.data.terminals).flat(),
  };
}

export function capturedBy(target: Target, site: Site): boolean {
  return target === "all" || target === site;
}

export function namePicker(prefixes: string[]): (name: string) => boolean {
  return (name) => prefixes.length === 0 || prefixes.some((p) => name.startsWith(p));
}
