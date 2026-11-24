import { SEARCH_FIELDS } from "@/search/fields";

const EXAMPLES = [
  { query: "from:ana after:7d", meaning: "Mail from Ana in the last week" },
  { query: "type:file report", meaning: "Files with “report” in them" },
  { query: '"quarterly plan"', meaning: "The exact phrase" },
  { query: "invoice OR receipt", meaning: "Either word" },
  { query: "NOT type:mail", meaning: "Everything except mail" },
];

export function SearchHelp() {
  return (
    <div className="flex flex-col gap-5 text-[12px]">
      <section>
        <h3 className="text-[13px] font-medium text-foreground">Search everything</h3>
        <p className="mt-1 text-muted-foreground">
          Type words to match, add <code>key:value</code> to narrow, and join terms with{" "}
          <code>AND</code>, <code>OR</code> and <code>NOT</code>. Quotes match an exact phrase.
          Arrow down to reach commands and recent searches.
        </p>
      </section>
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
          Examples
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {EXAMPLES.map((example) => (
            <div key={example.query} className="contents">
              <dt className="font-mono text-foreground">{example.query}</dt>
              <dd className="text-muted-foreground">{example.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Keys</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {SEARCH_FIELDS.map((field) => (
            <div key={field.key} className="contents">
              <dt className="font-mono text-foreground">{field.key}:</dt>
              <dd className="text-muted-foreground">{field.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
