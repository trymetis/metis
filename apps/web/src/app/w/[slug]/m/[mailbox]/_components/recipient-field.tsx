"use client";

import {
  Combobox,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@metis/ui/components/combobox";
import { useMemo, useState } from "react";

import { RemovableChip } from "@/components/removable-chip";
import type { ContactSuggestion } from "@/hooks/use-contact-suggestions";
import { emailAddressSchema } from "@/server/schema";

interface RecipientFieldProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  contacts: ContactSuggestion[];
  placeholder?: string;
  ariaLabel: string;
}

export function RecipientField({
  values,
  onValuesChange,
  contacts,
  placeholder,
  ariaLabel,
}: RecipientFieldProps) {
  const [inputValue, setInputValue] = useState("");
  const [highlighted, setHighlighted] = useState<string | undefined>();
  const anchorRef = useComboboxAnchor();

  const emails = useMemo(() => contacts.map((c) => c.email), [contacts]);
  const nameByEmail = useMemo(() => new Map(contacts.map((c) => [c.email, c.name])), [contacts]);

  function commitRaw(raw: string): boolean {
    const parts = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = parts.filter(
      (p) => emailAddressSchema.safeParse(p).success && !values.includes(p.toLowerCase()),
    );
    if (valid.length === 0) return false;
    onValuesChange([...values, ...valid.map((v) => v.toLowerCase())]);
    setInputValue("");
    return true;
  }

  return (
    <Combobox
      multiple
      items={emails}
      value={values}
      onValueChange={onValuesChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onItemHighlighted={setHighlighted}
      itemToStringLabel={(email: string) => {
        const name = nameByEmail.get(email);
        return name ? `${name} <${email}>` : email;
      }}
    >
      <ComboboxChips
        ref={anchorRef}
        className="min-h-0 w-full flex-1 rounded-none border-0 bg-transparent px-0 py-2.5 shadow-none focus-within:border-transparent focus-within:ring-0 dark:bg-transparent"
      >
        {values.map((email) => (
          <RemovableChip key={email} label={email}>
            {email}
          </RemovableChip>
        ))}
        <ComboboxChipsInput
          aria-label={ariaLabel}
          placeholder={values.length === 0 ? placeholder : undefined}
          className="bg-transparent py-0.5 text-[14px] text-foreground"
          onKeyDown={(e) => {
            const raw = inputValue.trim();
            if (e.key === "," || e.key === ";") {
              e.preventDefault();
              commitRaw(raw);
            } else if (e.key === "Enter" && raw && highlighted === undefined) {
              e.preventDefault();
              if (!commitRaw(raw)) e.preventBaseUIHandler();
            }
          }}
          onBlur={() => {
            const raw = inputValue.trim();
            if (raw) commitRaw(raw);
          }}
        />
      </ComboboxChips>
      {emails.length > 0 && (
        <ComboboxContent anchor={anchorRef} className="data-empty:hidden">
          <ComboboxList>
            {(email: string) => {
              const name = nameByEmail.get(email);
              return (
                <ComboboxItem key={email} value={email}>
                  <div className="flex min-w-0 flex-col py-0.5">
                    {name && <span className="truncate text-[13px] text-foreground">{name}</span>}
                    <span className="truncate font-mono text-[11px] text-faint">{email}</span>
                  </div>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      )}
    </Combobox>
  );
}
