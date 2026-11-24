"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@metis/ui/components/input-group";
import { cn } from "@metis/ui/lib/utils";
import { Search, X } from "lucide-react";
import type { ComponentProps } from "react";

export function SearchInput({
  value,
  onValueChange,
  onClear,
  label,
  className,
  inputClassName,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "aria-label"> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  label: string;
  inputClassName?: string;
}) {
  return (
    <InputGroup className={cn("h-8", className)}>
      <InputGroupAddon>
        <Search className="size-3.5 text-faint" />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("text-[13px]", inputClassName)}
        {...props}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear search"
            className="text-faint"
            onClick={() => {
              onValueChange("");
              onClear?.();
            }}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
