"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";

export const ALL = "all" as const;

export function FilterSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T | typeof ALL;
  items: { value: T | typeof ALL; label: string }[];
  onChange: (value: T | typeof ALL) => void;
}) {
  return (
    <Select<string>
      items={items}
      value={value}
      onValueChange={(next) => {
        const picked = items.find((item) => item.value === next);
        if (picked) onChange(picked.value);
      }}
    >
      <SelectTrigger size="sm" className="w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function orUndefined<T extends string>(value: T | typeof ALL): T | undefined {
  return value === ALL ? undefined : value;
}
