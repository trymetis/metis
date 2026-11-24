import { cn } from "@metis/ui/lib/utils";
import { ChevronDown } from "lucide-react";

const LABEL_CLASS = "text-[10px] font-medium uppercase tracking-[1.5px] text-faint";

export function SidebarSection({
  label,
  children,
  className,
  collapsed = false,
  onToggle,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={cn("mb-6 px-3", className)}>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className={cn(
            LABEL_CLASS,
            "mb-1.5 flex w-full items-center justify-between gap-2 rounded-md px-2 text-left transition-colors hover:text-muted-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown
            className={cn("size-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
          />
        </button>
      ) : (
        <div className={cn(LABEL_CLASS, "mb-1.5 px-2")}>{label}</div>
      )}
      {!collapsed && <div className="space-y-px">{children}</div>}
    </div>
  );
}
