"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { cn } from "@metis/ui/lib/utils";

export function FormSelect<T extends string>({
  value,
  onValueChange,
  options,
  className,
  id,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <Select
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
