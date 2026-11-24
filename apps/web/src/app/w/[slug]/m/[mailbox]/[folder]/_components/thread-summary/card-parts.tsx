"use client";

import { Button, buttonVariants } from "@metis/ui/components/button";
import { Spinner } from "@metis/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronUp, Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";

const CompactActionsContext = createContext(false);

export const CollapseContext = createContext<(() => void) | null>(null);

export function CompactActions({ children }: { children: ReactNode }) {
  return <CompactActionsContext.Provider value={true}>{children}</CompactActionsContext.Provider>;
}

export function CardShell({
  icon: Icon,
  label,
  aside,
  children,
}: {
  icon: LucideIcon;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const collapse = useContext(CollapseContext);
  return (
    <div className="@container rounded-lg border border-primary/22 bg-primary/8 px-3.5 py-3 wrap-anywhere">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="size-3.5 text-primary" />
        <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-primary">
          {label}
        </span>
        {(aside || collapse) && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {aside && <CompactActions>{aside}</CompactActions>}
            {collapse && (
              <IconButton label="Hide summary" size="icon-xs" onClick={collapse}>
                <ChevronUp className="size-3.5 text-primary" />
              </IconButton>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium leading-relaxed text-foreground">{children}</p>;
}

const detailsVariants = cva("mt-2 grid grid-cols-1 gap-x-4 gap-y-2", {
  variants: {
    columns: {
      one: "",
      two: "@md:grid-cols-2",
    },
  },
  defaultVariants: { columns: "one" },
});

export function Details({
  columns,
  children,
}: VariantProps<typeof detailsVariants> & { children: ReactNode }) {
  return <div className={detailsVariants({ columns })}>{children}</div>;
}

export function Detail({
  icon: Icon,
  label,
  wide,
  action,
  children,
}: {
  icon: LucideIcon;
  label: string;
  wide?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 gap-2", wide && "@md:col-span-2")}>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary/80" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-[1px] text-faint">{label}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <div className="min-w-0 break-words text-[12px] leading-snug text-muted-foreground">
            {children}
          </div>
          {action && (
            <div className="flex items-center gap-1">
              <CompactActions>{action}</CompactActions>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const INTENT_VARIANTS = {
  primary: "default",
  secondary: "tinted",
  quiet: "ghost",
} as const;

export type CardActionIntent = keyof typeof INTENT_VARIANTS;

export const cardLabelClassName = buttonVariants({
  variant: INTENT_VARIANTS.secondary,
  size: "sm",
});

export function CardAction({
  intent = "secondary",
  icon: Icon,
  loading = false,
  iconOnly = false,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  intent?: CardActionIntent;
  icon?: LucideIcon;
  loading?: boolean;
  iconOnly?: boolean;
}) {
  const compact = useContext(CompactActionsContext);
  const iconNode = loading ? <Spinner /> : Icon && <Icon />;
  if (iconOnly && Icon) {
    const label = typeof children === "string" ? children : undefined;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              {...props}
              aria-label={label}
              disabled={disabled || loading}
              variant={INTENT_VARIANTS[intent]}
              size={compact ? "icon-xs" : "icon-sm"}
            />
          }
        >
          {iconNode}
        </TooltipTrigger>
        <TooltipContent>{children}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      variant={INTENT_VARIANTS[intent]}
      size={compact ? "xs" : "sm"}
    >
      {iconNode}
      {children}
    </Button>
  );
}

export function CardLink({
  href,
  intent,
  icon = ExternalLink,
  iconOnly,
  children,
}: {
  href: string;
  intent?: CardActionIntent;
  icon?: LucideIcon;
  iconOnly?: boolean;
  children: ReactNode;
}) {
  const external = /^https?:/i.test(href);
  return (
    <CardAction
      intent={intent}
      icon={icon}
      iconOnly={iconOnly}
      nativeButton={false}
      render={
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI renders the CardAction children inside this anchor
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        />
      }
    >
      {children}
    </CardAction>
  );
}

export function CopyButton({
  text,
  label,
  intent,
  iconOnly,
}: {
  text: string;
  label: string;
  intent?: CardActionIntent;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <CardAction
      intent={intent}
      iconOnly={iconOnly}
      icon={copied ? Check : Copy}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Couldn't copy to the clipboard"),
        );
      }}
    >
      {copied ? "Copied" : label}
    </CardAction>
  );
}

export function CompactShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px] text-foreground">
      <CompactActions>{children}</CompactActions>
    </div>
  );
}
