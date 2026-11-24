import { cn } from "@metis/ui/lib/utils";

import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CursorDark } from "@/components/ui/svgs/cursorDark";
import { CursorLight } from "@/components/ui/svgs/cursorLight";
import { ModelContextProtocolDark } from "@/components/ui/svgs/modelContextProtocolDark";
import { ModelContextProtocolLight } from "@/components/ui/svgs/modelContextProtocolLight";
import { Openai } from "@/components/ui/svgs/openai";
import { OpenaiDark } from "@/components/ui/svgs/openaiDark";
import { Vscode } from "@/components/ui/svgs/vscode";
import type { McpPresetId } from "@/mcp/presets";

export function McpPresetIcon({
  preset,
  className,
}: {
  preset: McpPresetId | null;
  className?: string;
}) {
  const size = cn("size-full", className);

  switch (preset) {
    case "claude-code":
    case "claude-desktop":
      return <ClaudeAiIcon className={size} />;
    case "codex":
      return (
        <>
          <Openai className={cn(size, "dark:hidden")} />
          <OpenaiDark className={cn(size, "hidden dark:block")} />
        </>
      );
    case "cursor-desktop":
    case "cursor-web":
      return (
        <>
          <CursorLight className={cn(size, "dark:hidden")} />
          <CursorDark className={cn(size, "hidden dark:block")} />
        </>
      );
    case "vscode":
      return <Vscode className={size} />;
    default:
      return (
        <>
          <ModelContextProtocolLight className={cn(size, "dark:hidden")} />
          <ModelContextProtocolDark className={cn(size, "hidden dark:block")} />
        </>
      );
  }
}
