"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";
import { getQueryClient } from "@/lib/query-client";
import type { MailboxScope } from "@/server/schema";
import type { LabelColor } from "@/types/mail";

import { useMailboxScope } from "./use-workspace-path";

export interface CustomLabel {
  id: string;
  key: string;
  name: string;
  color: LabelColor;
}

const NO_LABELS: CustomLabel[] = [];

export function customLabelsQuery(scope: MailboxScope) {
  return rpc.mail.customLabels.list.queryOptions({ input: scope });
}

export function useCustomLabels(): CustomLabel[] {
  const scope = useMailboxScope();
  return useQuery(customLabelsQuery(scope)).data?.labels ?? NO_LABELS;
}

function updateCustomLabels(scope: MailboxScope, update: (labels: CustomLabel[]) => CustomLabel[]) {
  getQueryClient().setQueryData(customLabelsQuery(scope).queryKey, (old) =>
    old ? { ...old, labels: update(old.labels ?? []) } : old,
  );
}

export function addCustomLabel(scope: MailboxScope, label: CustomLabel) {
  updateCustomLabels(scope, (labels) => [...labels, label]);
}

export function replaceCustomLabel(scope: MailboxScope, label: CustomLabel) {
  updateCustomLabels(scope, (labels) => labels.map((l) => (l.key === label.key ? label : l)));
}

export function removeCustomLabel(scope: MailboxScope, id: string) {
  updateCustomLabels(scope, (labels) => labels.filter((l) => l.id !== id));
}
