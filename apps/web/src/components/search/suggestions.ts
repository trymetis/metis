import type { ParserAst } from "@/search/ast";
import { positiveTags, tagKey, tagText } from "@/search/ast";
import {
  fieldValues,
  isSearchKind,
  SEARCH_FIELDS,
  type SearchKind,
  searchField,
} from "@/search/fields";
import type { CaretContext } from "@/search/tokens";
import type { SearchSuggestion } from "@/server/schema";

import type { Suggestion } from "./items";
import { quoteValue } from "./queries";

export const REMOTE_SUGGEST_KEYS = new Set([
  "mailbox",
  "calendar",
  "drive",
  "addressbook",
  "book",
  "sub-calendar",
  "label",
  "workflow",
  "from",
  "to",
  "cc",
  "attendee",
  "organizer",
  "email",
]);

const DATE_PRESETS = ["today", "yesterday", "7d", "30d", "1y"];
const SIZE_PRESETS = [">1mb", ">10mb", ">100mb", "<100kb"];
const LIMIT = 8;
const OPERATORS = new Set(["AND", "OR", "NOT"]);

function typedKinds(ast: ParserAst | null): SearchKind[] | null {
  if (!ast) return null;
  const kinds = positiveTags(ast)
    .filter((tag) => tagKey(tag) === "type")
    .map((tag) => (tagText(tag) ?? "").toLowerCase())
    .filter(isSearchKind);
  return kinds.length > 0 ? kinds : null;
}

function starts(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

export function buildSuggestions(
  context: CaretContext | null,
  ast: ParserAst | null,
  remote: SearchSuggestion[] | null,
): Suggestion[] {
  if (!context) return [];
  const kinds = typedKinds(ast);

  if (context.mode === "key") {
    if (!context.prefix || OPERATORS.has(context.prefix)) return [];
    return SEARCH_FIELDS.filter(
      (field) =>
        starts(field.key, context.prefix) &&
        field.key !== context.prefix.toLowerCase() &&
        (!kinds || field.kinds.some((k) => kinds.includes(k))),
    )
      .slice(0, LIMIT)
      .map((field) => ({
        value: `${field.key}:`,
        label: `${field.key}:`,
        detail: field.description,
        start: context.start,
        end: context.end,
        complete: false,
      }));
  }

  const field = searchField(context.key);
  if (!field) return [];
  const value = (raw: string, label = raw, detail?: string): Suggestion => ({
    value: `${raw} `,
    label,
    detail,
    start: context.start,
    end: context.end,
    complete: true,
  });

  if (field.type === "enum") {
    const allowed = kinds
      ? [...new Set(kinds.flatMap((k) => field.values?.[k] ?? []))]
      : fieldValues(field);
    return (allowed.length ? allowed : fieldValues(field))
      .filter((v) => starts(v, context.prefix) && v !== context.prefix)
      .slice(0, LIMIT)
      .map((v) => value(v));
  }
  if (field.type === "date") {
    return DATE_PRESETS.filter((v) => starts(v, context.prefix))
      .slice(0, LIMIT)
      .map((v) => value(v));
  }
  if (field.type === "size") {
    return SIZE_PRESETS.filter((v) => starts(v, context.prefix))
      .slice(0, LIMIT)
      .map((v) => value(v));
  }
  if (!REMOTE_SUGGEST_KEYS.has(field.key) || !remote) return [];
  return remote
    .filter((s) => s.value.toLowerCase() !== context.prefix.toLowerCase())
    .slice(0, LIMIT)
    .map((s) => value(quoteValue(s.value), s.label, s.detail ?? s.value));
}
