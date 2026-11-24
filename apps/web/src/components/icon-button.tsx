"use client";

import { Button } from "@metis/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import type { ComponentProps } from "react";

export function IconButton({
  label,
  tooltip,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label"> & { label: string; tooltip?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant={variant} size={size} aria-label={label} {...props} />}
      />
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
