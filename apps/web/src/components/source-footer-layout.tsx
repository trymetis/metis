import { cn } from "@metis/ui/lib/utils";

import { SourceLink } from "@/components/source-link";
import { sourceInfo } from "@/source-info";

export function SourceFooterLayout({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative min-h-dvh [&>*:first-child]:pb-16", className)}>
      {children}
      <footer className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
        <SourceLink source={sourceInfo()} />
      </footer>
    </div>
  );
}
