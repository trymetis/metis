export function AccountOption({
  name,
  email,
  providerLabel,
  server,
  mark,
}: {
  name: string;
  email?: string;
  providerLabel: string;
  server: string | null;
  mark?: string;
}) {
  const line = [providerLabel, server, email].filter(
    (part): part is string => typeof part === "string" && part !== "" && !name.includes(part),
  );
  return (
    <span className="flex min-w-0 items-center gap-2">
      {mark && (
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: mark }} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px]">{name}</span>
        {line.length > 0 && (
          <span className="block truncate text-[10px] text-faint">{line.join(" · ")}</span>
        )}
      </span>
    </span>
  );
}
