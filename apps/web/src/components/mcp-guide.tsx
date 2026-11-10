import { CopyButton } from "@/components/copy-button";
import type { McpGuide } from "@/mcp/presets";

function guideLabel(guide: McpGuide): string {
  if (guide.kind === "command") return "Run this in your terminal";
  if (guide.kind === "config") return `Add this to ${guide.file}`;
  return "Do this in the client";
}

function CopyRow({ value, label, mono }: { value: string; label: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-panel py-1 pr-1 pl-3">
      {mono ? (
        <pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[12px] text-foreground select-all">
          {value}
        </pre>
      ) : (
        <p className="min-w-0 flex-1 break-all py-1.5 font-mono text-[12px] text-foreground select-all">
          {value}
        </p>
      )}
      <CopyButton value={value} label={label} className="shrink-0" />
    </div>
  );
}

export function McpGuideBlock({ guide, heading }: { guide: McpGuide; heading?: string }) {
  return (
    <div>
      {heading && (
        <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
          {heading}
        </span>
      )}
      <p className="mt-1 text-[12px] text-muted-foreground">{guideLabel(guide)}</p>
      <div className="mt-1 flex flex-col gap-1.5">
        {guide.kind === "steps" ? (
          <>
            <p className="rounded-lg bg-panel px-3 py-2 text-[13px] text-foreground">
              {guide.text}
            </p>
            {guide.values?.map((v) => (
              <div key={v.label}>
                <span className="text-[11px] text-faint">{v.label}</span>
                <CopyRow value={v.value} label={`Copy ${v.label.toLowerCase()}`} />
              </div>
            ))}
          </>
        ) : (
          <CopyRow
            value={guide.text}
            label={guide.kind === "command" ? "Copy command" : "Copy config"}
            mono
          />
        )}
      </div>
    </div>
  );
}
