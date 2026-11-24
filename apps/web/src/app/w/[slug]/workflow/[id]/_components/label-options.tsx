"use client";

import { useQueries } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { LABEL_SELECT_OPTIONS } from "@/mail/label-meta";

type LabelOption = { value: string; label: string };

const LabelOptionsContext = createContext<LabelOption[]>(LABEL_SELECT_OPTIONS);

export function LabelOptionsProvider({
  mailboxes,
  children,
}: {
  mailboxes: readonly { slug: string }[];
  children: ReactNode;
}) {
  const scope = useWorkspaceScope();
  const lists = useQueries({
    queries: mailboxes.map((mailbox) =>
      rpc.mail.customLabels.list.queryOptions({
        input: { ...scope, mailboxSlug: mailbox.slug },
      }),
    ),
    combine: (results) => results.map((result) => result.data?.labels),
  });

  const options = useMemo(() => {
    const byKey = new Map<string, LabelOption>();
    for (const label of lists.flatMap((labels) => labels ?? [])) {
      if (!byKey.has(label.key)) {
        byKey.set(label.key, { value: label.key, label: label.name });
      }
    }
    return [...LABEL_SELECT_OPTIONS, ...byKey.values()];
  }, [lists]);
  return <LabelOptionsContext.Provider value={options}>{children}</LabelOptionsContext.Provider>;
}

export function useLabelOptions(): LabelOption[] {
  return useContext(LabelOptionsContext);
}
