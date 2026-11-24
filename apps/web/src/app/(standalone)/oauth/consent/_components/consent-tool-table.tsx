import { cn } from "@metis/ui/lib/utils";

import { recordOf } from "@/lib/records";
import {
  CONSENT_ACCESS,
  CONSENT_BUCKETS,
  type ConsentAction,
  type ConsentBucket,
} from "@/mcp/consent-access";
import { isMcpToolKey, isSensitiveTool, type McpToolKey } from "@/mcp/tools";

interface ConsentTool {
  key: McpToolKey;
  label: string;
}

type Cells = Record<ConsentBucket, Record<ConsentAction, ConsentTool[]>>;

function cellsOf(tools: readonly { key: string; label: string }[]): Cells {
  const cells: Cells = recordOf(
    CONSENT_BUCKETS.map((b) => b.key),
    () => ({ read: [], write: [] }),
  );
  for (const tool of tools) {
    if (!isMcpToolKey(tool.key)) continue;
    const { bucket, action } = CONSENT_ACCESS[tool.key];
    cells[bucket][action].push({ key: tool.key, label: tool.label });
  }
  for (const bucket of CONSENT_BUCKETS) {
    for (const list of Object.values(cells[bucket.key])) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
  }
  return cells;
}

function Cell({ tools, action }: { tools: ConsentTool[]; action: ConsentAction }) {
  if (tools.length === 0) return <span className="text-[12px] text-faint">None</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {tools.map((tool) => {
        const sensitive = isSensitiveTool(tool.key);
        return (
          <li
            key={tool.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 text-[12px] leading-5",
              action === "read" ? "bg-muted/50 text-muted-foreground" : "bg-muted text-foreground",
            )}
          >
            {sensitive && (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive/45" />
            )}
            {tool.label}
            {sensitive && <span className="sr-only"> (sensitive)</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function ConsentToolTable({ tools }: { tools: readonly { key: string; label: string }[] }) {
  const cells = cellsOf(tools);
  const buckets = CONSENT_BUCKETS.filter(
    (b) => cells[b.key].read.length + cells[b.key].write.length > 0,
  );
  return (
    <div className="mt-2">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-[11px] text-faint">
            <th className="w-24 py-1.5 pr-3 font-medium">
              <span className="sr-only">Area</span>
            </th>
            <th className="py-1.5 pr-3 font-medium">Read</th>
            <th className="py-1.5 font-medium">Write</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => {
            const { read, write } = cells[bucket.key];
            return (
              <tr
                key={bucket.key}
                className="border-b border-border-soft align-top last:border-b-0"
              >
                <th scope="row" className="py-2 pr-3 text-[12px] font-medium text-foreground">
                  {bucket.label}
                  <span className="block text-[11px] font-normal text-faint tabular-nums">
                    {read.length + write.length}
                  </span>
                </th>
                <td className="py-2 pr-3">
                  <Cell tools={read} action="read" />
                </td>
                <td className="py-2">
                  <Cell tools={write} action="write" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        <span aria-hidden className="size-1.5 rounded-full bg-destructive/45" />
        Sensitive: sends, deletes, changes events and files, runs workflows or manages members
      </p>
    </div>
  );
}
