import { SyntaxError as LiqeSyntaxError, parse } from "liqe";

import { parseSize } from "@/lib/size";

import { type ParserAst, parenDepth, tagKey, tagOperator, tags, tagText } from "./ast";
import { parseSearchDate } from "./dates";
import { fieldValues, RETIRED_KEYS, searchField } from "./fields";

export const MAX_SEARCH_DEPTH = 5;
export const MAX_SEARCH_LENGTH = 500;

export interface SearchDiagnostic {
  start: number;
  end: number;
  message: string;
}

export type ParsedSearch =
  | { ok: true; ast: ParserAst; diagnostics: SearchDiagnostic[] }
  | {
      ok: false;
      incomplete: boolean;
      offset: number | null;
      diagnostics: SearchDiagnostic[];
    };

function failure(text: string, err: unknown): ParsedSearch {
  if (err instanceof LiqeSyntaxError) {
    return {
      ok: false,
      incomplete: false,
      offset: err.offset,
      diagnostics: [
        {
          start: err.offset,
          end: text.length,
          message: "This part of the search can't be read",
        },
      ],
    };
  }
  return {
    ok: false,
    incomplete: true,
    offset: null,
    diagnostics: [
      {
        start: text.length,
        end: text.length,
        message: "Finish the search: close every quote and parenthesis",
      },
    ],
  };
}

function checkTags(ast: ParserAst, timeZone: string): SearchDiagnostic[] {
  const out: SearchDiagnostic[] = [];
  for (const tag of tags(ast)) {
    const key = tagKey(tag);
    if (key === null) continue;
    const at = tag.location;
    const keyEnd = tag.field.type === "Field" ? tag.field.location.end : at.end;
    const retired = RETIRED_KEYS[key];
    if (retired) {
      out.push({ start: at.start, end: keyEnd, message: retired });
      continue;
    }
    const field = searchField(key);
    if (!field) {
      out.push({
        start: at.start,
        end: keyEnd,
        message: `There is no ${key}: filter`,
      });
      continue;
    }

    const value = tag.expression;
    if (value.type === "EmptyExpression") {
      out.push({
        start: at.start,
        end: at.end,
        message: `Add a value after ${key}:`,
      });
      continue;
    }

    const operator = tagOperator(tag);
    const comparable = field.type === "date" || field.type === "size";
    if (operator !== ":" && !comparable) {
      out.push({
        start: tag.operator.location.start,
        end: tag.operator.location.end,
        message: `${key}: does not compare with < or >`,
      });
      continue;
    }

    if (value.type === "RangeExpression") {
      if (field.type !== "size") {
        out.push({
          start: value.location.start,
          end: value.location.end,
          message: `${key}: does not take a range`,
        });
      }
      continue;
    }

    if (value.type === "RegexExpression") {
      if (field.type !== "text") {
        out.push({
          start: value.location.start,
          end: value.location.end,
          message: `${key}: does not take a pattern`,
        });
      }
      continue;
    }

    const text = tagText(tag) ?? "";
    if (field.type === "enum") {
      const allowed = fieldValues(field);
      if (!allowed.some((v) => v.toLowerCase() === text.toLowerCase())) {
        out.push({
          start: value.location.start,
          end: value.location.end,
          message: `${key}: takes ${allowed.join(", ")}`,
        });
      }
    } else if (field.type === "date") {
      if (!parseSearchDate(text, timeZone)) {
        out.push({
          start: value.location.start,
          end: value.location.end,
          message: `${key}: takes a date such as 2026-01-31, today or 7d`,
        });
      }
    } else if (field.type === "size") {
      if (parseSize(text) === null) {
        out.push({
          start: value.location.start,
          end: value.location.end,
          message: `${key}: takes a size such as 5mb or 200kb`,
        });
      }
    }
  }
  return out;
}

export function parseSearch(text: string, timeZone = "UTC"): ParsedSearch {
  if (text.length > MAX_SEARCH_LENGTH) {
    return {
      ok: false,
      incomplete: false,
      offset: MAX_SEARCH_LENGTH,
      diagnostics: [
        {
          start: MAX_SEARCH_LENGTH,
          end: text.length,
          message: `Searches are limited to ${MAX_SEARCH_LENGTH} characters`,
        },
      ],
    };
  }

  let ast: ParserAst;
  try {
    ast = parse(text);
  } catch (err) {
    return failure(text, err);
  }

  const diagnostics = checkTags(ast, timeZone);
  if (parenDepth(ast) > MAX_SEARCH_DEPTH) {
    diagnostics.push({
      start: 0,
      end: text.length,
      message: `Parentheses nest at most ${MAX_SEARCH_DEPTH} levels deep`,
    });
  }
  return { ok: true, ast, diagnostics };
}

export function isEmptySearch(ast: ParserAst): boolean {
  return ast.type === "EmptyExpression";
}
