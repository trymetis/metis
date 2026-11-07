"use client";

import { Fragment } from "react";

import {
  type AgentReference,
  REFERENCE_TYPE_NOUN,
  type ReferenceType,
  splitReferences,
} from "@/ai/references";

import { ReferenceChip } from "./reference-chip";
import { useAgentReferences, useResolvedReference } from "./reference-provider";

const OPENABLE_TYPES: ReadonlySet<ReferenceType> = new Set(["file", "member", "contact"]);

function InlineReference({ raw, ...ref }: AgentReference & { raw: string }) {
  const resolved = useResolvedReference(ref);
  const open = useAgentReferences()?.open ?? null;

  if (resolved === null) return <>{raw}</>;

  const chip = (
    <ReferenceChip
      className={resolved ? undefined : "opacity-60"}
      label={resolved?.label ?? REFERENCE_TYPE_NOUN[ref.type]}
      title={resolved?.detail}
      type={ref.type}
    />
  );

  if (!resolved || !open || !OPENABLE_TYPES.has(ref.type)) return chip;

  return (
    <button
      type="button"
      onClick={() => open(resolved)}
      aria-label={
        ref.type === "member"
          ? `Show ${resolved.label}`
          : ref.type === "contact"
            ? `Open contact ${resolved.label}`
            : `Preview ${resolved.label}`
      }
      className="cursor-pointer rounded-md align-baseline outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {chip}
    </button>
  );
}

export function ReferenceText({ text }: { text: string }) {
  const resolvable = useAgentReferences() !== null;

  if (!resolvable) {
    return <p className="wrap-break-word whitespace-pre-wrap">{text}</p>;
  }

  return (
    <p className="wrap-break-word whitespace-pre-wrap">
      {splitReferences(text).map((segment, index) =>
        segment.kind === "text" ? (
          // oxlint-disable-next-line react/no-array-index-key --segments are positional and regenerated wholesale
          <Fragment key={`t${index}`}>{segment.text}</Fragment>
        ) : (
          <InlineReference
            id={segment.id}
            // oxlint-disable-next-line react/no-array-index-key --segments are positional and regenerated wholesale
            key={`r${index}`}
            raw={segment.raw}
            type={segment.type}
          />
        ),
      )}
    </p>
  );
}
