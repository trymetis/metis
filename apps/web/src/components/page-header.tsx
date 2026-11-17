import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      {eyebrow && (
        <p className="text-[11px] font-medium tracking-wide text-faint uppercase">{eyebrow}</p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h1 className="flex min-w-0 items-center gap-2.5 text-[28px] font-medium tracking-tight text-foreground">
          {icon}
          {title}
        </h1>
        {action && <div className="flex shrink-0 items-center gap-2 pt-1.5">{action}</div>}
      </div>
      {description && <p className="mt-1 text-[13px] text-faint">{description}</p>}
    </header>
  );
}
