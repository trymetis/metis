import { highlight, test } from "liqe";

import { parseSize } from "@/lib/size";

import {
  andAll,
  type Comparison,
  escapeRegex,
  numberLiteral,
  type ParserAst,
  regexLiteral,
  retag,
  type TagToken,
  tagKey,
  tagOperator,
  tagQuoted,
  tagText,
} from "./ast";
import { instantDay, parseSearchDate } from "./dates";
import { searchField } from "./fields";

export type SearchDocValue = string | number | boolean | null | undefined | SearchDocValue[];
export type SearchDoc = Record<string, SearchDocValue>;

function exact(value: string): string {
  return `/^${escapeRegex(value)}$/i`;
}

function contains(value: string): string {
  return `/${escapeRegex(value)}/i`;
}

function dateNode(tag: TagToken, timeZone: string, now: number): ParserAst {
  const key = tagKey(tag) ?? "";
  const span = parseSearchDate(tagText(tag) ?? "", timeZone, now);
  if (!span) return tag;
  const instant = span.start === span.end;
  const day = instant ? instantDay(span.start, timeZone) : span;
  const at = (value: number, operator: Comparison) =>
    retag(tag, numberLiteral(value, tag), "date", operator);
  const during = () => andAll([at(day.start, ":>="), at(day.end, ":<")]) ?? tag;

  if (key === "after") return at(span.start, ":>=");
  if (key === "before") return at(span.start, ":<");
  if (key === "on") return during();

  switch (tagOperator(tag)) {
    case ":>":
      return at(instant ? span.start : span.end, ":>=");
    case ":>=":
      return at(span.start, ":>=");
    case ":<":
      return at(span.start, ":<");
    case ":<=":
      return at(instant ? span.start : span.end, ":<");
    default:
      return during();
  }
}

function sizeNode(tag: TagToken): ParserAst {
  if (tag.expression.type === "RangeExpression") return tag;
  const bytes = parseSize(tagText(tag) ?? "");
  if (bytes === null) return tag;
  const operator = tagOperator(tag);
  return retag(tag, numberLiteral(bytes, tag), "size", operator === ":" ? ":>=" : operator);
}

function tagForMatch(tag: TagToken, timeZone: string, now: number): ParserAst {
  const key = tagKey(tag);
  if (key === null) {
    if (!tagQuoted(tag)) return retag(tag, tag.expression, "text");
    return retag(tag, regexLiteral(contains(tagText(tag) ?? ""), tag), "text");
  }
  const field = searchField(key);
  if (!field) return tag;
  if (field.type === "date") return dateNode(tag, timeZone, now);
  if (field.type === "size") return sizeNode(tag);
  if (tag.expression.type !== "LiteralExpression") return tag;
  const text = tagText(tag) ?? "";
  if (field.type === "enum" || field.type === "slug") {
    return retag(tag, regexLiteral(exact(text), tag), key);
  }
  if (tagQuoted(tag)) {
    return retag(tag, regexLiteral(contains(text), tag), key);
  }
  return tag;
}

export function forMatching(ast: ParserAst, timeZone: string, now: number = Date.now()): ParserAst {
  switch (ast.type) {
    case "Tag":
      return tagForMatch(ast, timeZone, now);
    case "ParenthesizedExpression":
      return { ...ast, expression: forMatching(ast.expression, timeZone, now) };
    case "UnaryOperator":
      return { ...ast, operand: forMatching(ast.operand, timeZone, now) };
    case "LogicalExpression":
      return {
        ...ast,
        left: forMatching(ast.left, timeZone, now),
        right: forMatching(ast.right, timeZone, now),
      };
    default:
      return ast;
  }
}

export interface SearchMatcher {
  matches(doc: SearchDoc): boolean;
  highlights(doc: SearchDoc): { path: string; query?: RegExp }[];
}

const MATCH_ALL: SearchMatcher = {
  matches: () => true,
  highlights: () => [],
};

export function matcherFor(
  ast: ParserAst | null,
  timeZone: string,
  now: number = Date.now(),
): SearchMatcher {
  if (!ast || ast.type === "EmptyExpression") return MATCH_ALL;
  const ready = forMatching(ast, timeZone, now);
  return {
    matches: (doc) => {
      try {
        return test(ready, doc);
      } catch {
        return false;
      }
    },
    highlights: (doc) => {
      try {
        return highlight(ready, doc);
      } catch {
        return [];
      }
    },
  };
}

export function needsKey(ast: ParserAst | null, key: string): boolean {
  if (!ast) return false;
  let found = false;
  const visit = (node: ParserAst) => {
    if (found) return;
    switch (node.type) {
      case "Tag":
        found = tagKey(node) === key;
        return;
      case "LogicalExpression":
        visit(node.left);
        visit(node.right);
        return;
      case "UnaryOperator":
        visit(node.operand);
        return;
      case "ParenthesizedExpression":
        visit(node.expression);
        return;
      default:
        return;
    }
  };
  visit(ast);
  return found;
}
