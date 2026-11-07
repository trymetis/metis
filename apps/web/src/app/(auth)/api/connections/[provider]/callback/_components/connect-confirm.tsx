"use client";

import { Button } from "@metis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { useActionState, useState } from "react";

import { NativeCard } from "@/components/native-card";

import { type ConfirmResult, confirmConnection } from "../actions";

const NO_WORKSPACE = "__none__";
const INITIAL: ConfirmResult = { error: null };

export function ConnectConfirm({
  provider,
  query,
  label,
  resource,
  metisEmail,
  workspaces,
  preselected,
}: {
  provider: string;
  query: string;
  label: string;
  resource: string;
  metisEmail: string;
  workspaces: { slug: string; name: string }[];
  preselected: string | null;
}) {
  const [result, formAction, pending] = useActionState(confirmConnection, INITIAL);
  const [workspace, setWorkspace] = useState(preselected ?? NO_WORKSPACE);
  const items = [
    { value: NO_WORKSPACE, label: "Don't add to a workspace" },
    ...workspaces.map((w) => ({ value: w.slug, label: w.name })),
  ];

  return (
    <NativeCard
      title={`Connect ${label}?`}
      body={
        <>
          This connects the {label} account you just approved, for {resource}, to the Metis Suite
          account{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{metisEmail}</span>.
          Only continue if that is your account and you started this yourself.
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-2 text-left">
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="query" value={query} />
        <input type="hidden" name="workspace" value={workspace === NO_WORKSPACE ? "" : workspace} />
        <label
          htmlFor="connect-workspace"
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300"
        >
          Add to a workspace
        </label>
        <Select
          items={items}
          value={workspace}
          disabled={pending}
          onValueChange={(value) => {
            if (typeof value === "string") setWorkspace(value);
          }}
        >
          <SelectTrigger id="connect-workspace" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {result.error && <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>}
        <Button
          type="submit"
          name="intent"
          value="connect"
          className="mt-2 h-auto w-full rounded-xl px-4 py-3"
          disabled={pending}
        >
          {pending ? "Connecting…" : "Connect"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="cancel"
          variant="outline"
          className="h-auto w-full rounded-xl px-4 py-3"
          disabled={pending}
        >
          Cancel
        </Button>
      </form>
    </NativeCard>
  );
}
