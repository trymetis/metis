import {
  type CssNode,
  type Declaration,
  find,
  generate,
  ident,
  type List,
  type ListItem,
  parse,
  walk,
} from "css-tree";

import { isInlineUrl, isRemoteUrl, type UrlMapper } from "./urls";

type Theme = "light" | "dark";

interface StyleFacts {
  declaresDark: boolean;
  setsColors: boolean;
}

const IMAGE_FUNCTIONS = new Set(["image-set", "-webkit-image-set", "src", "url"]);
const COLOR_PROPERTIES = new Set(["color", "background", "background-color", "background-image"]);
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

function decoded(name: string): string {
  return ident.decode(name).toLowerCase();
}

function parseCss(
  css: string,
  context: "stylesheet" | "declarationList" | "value",
): CssNode | null {
  try {
    return parse(css, {
      context,
      parseValue: true,
      parseCustomProperty: true,
      parseAtrulePrelude: true,
      parseRulePrelude: false,
      positions: true,
    });
  } catch {
    return null;
  }
}

function closed(node: CssNode, source: string): boolean {
  if (!node.loc) return false;
  const text = source.slice(node.loc.start.offset, node.loc.end.offset);
  if (node.type === "Url") return text.endsWith(")");
  if (node.type === "String") {
    const quote = text[0];
    return text.length >= 2 && (quote === '"' || quote === "'") && text.endsWith(quote);
  }
  return true;
}

function urlInside(node: CssNode): string {
  if (node.type !== "Function") return "";
  const only = node.children.first;
  if (node.children.size === 1 && only?.type === "String") return only.value;
  return generate({ type: "Value", children: node.children });
}

function hasRaw(node: CssNode): boolean {
  return find(node, (n) => n.type === "Raw") !== null;
}

function remoteFont(node: CssNode): boolean {
  return (
    find(
      node,
      (n) =>
        (n.type === "Url" && !isInlineUrl(n.value)) ||
        (n.type === "String" && isRemoteUrl(n.value)) ||
        (n.type === "Function" && decoded(n.name) === "url"),
    ) !== null
  );
}

function darkScheme(declaration: Declaration): boolean {
  return (
    find(declaration.value, (n) => n.type === "Identifier" && decoded(n.name) === "dark") !== null
  );
}

function rewrite(
  root: CssNode,
  source: string,
  map: UrlMapper,
  theme: Theme | undefined,
  facts: StyleFacts | undefined,
): string {
  const edits: (() => void)[] = [];
  const remove = (item: ListItem<CssNode>, list: List<CssNode>) =>
    edits.push(() => list.remove(item));
  const replace = (item: ListItem<CssNode>, list: List<CssNode>, node: CssNode) =>
    edits.push(() => list.replace(item, list.createItem(node)));
  const mapped = (url: string): CssNode => {
    const next = map(url);
    return next === null ? { type: "Identifier", name: "none" } : { type: "Url", value: next };
  };

  walk(root, function enter(node, item, list) {
    switch (node.type) {
      case "Atrule": {
        const name = decoded(node.name);
        if (name === "import" || (name === "font-face" && remoteFont(node))) {
          if (list) remove(item, list);
          return walk.skip;
        }
        return;
      }
      case "Feature": {
        if (decoded(node.name) !== "prefers-color-scheme" || node.value?.type !== "Identifier") {
          return;
        }
        const scheme = decoded(node.value.name);
        if (facts && scheme === "dark") facts.declaresDark = true;
        if (theme && list) {
          replace(item, list, { type: "Raw", value: scheme === theme ? ALWAYS : NEVER });
        }
        return;
      }
      case "Declaration": {
        const property = decoded(node.property);
        if (node.value.type === "Raw" || hasRaw(node.value)) {
          if (list) remove(item, list);
          return walk.skip;
        }
        if (facts) {
          if (COLOR_PROPERTIES.has(property)) facts.setsColors = true;
          if (property === "supported-color-schemes") facts.declaresDark = true;
          if (property === "color-scheme" && darkScheme(node)) facts.declaresDark = true;
        }
        return;
      }
      case "Raw": {
        if (list && !this.atrulePrelude) remove(item, list);
        return;
      }
      case "Url": {
        if (!list) return;
        if (!closed(node, source)) {
          replace(item, list, { type: "Identifier", name: "none" });
          return;
        }
        const next = map(node.value);
        if (next === null) replace(item, list, { type: "Identifier", name: "none" });
        else if (next !== node.value) replace(item, list, { type: "Url", value: next });
        return;
      }
      case "Function": {
        if (decoded(node.name) !== "url" || !list) return;
        replace(item, list, mapped(urlInside(node)));
        return walk.skip;
      }
      case "String": {
        if (!this.declaration || !list) return;
        const inImage =
          this.function?.type === "Function" && IMAGE_FUNCTIONS.has(decoded(this.function.name));
        if (!inImage && !isRemoteUrl(node.value)) return;
        if (!closed(node, source)) {
          replace(item, list, { type: "Identifier", name: "none" });
          return;
        }
        const next = map(node.value);
        if (next === null) replace(item, list, { type: "Identifier", name: "none" });
        else if (next !== node.value) replace(item, list, { type: "String", value: next });
        return;
      }
      default:
        return;
    }
  });

  for (const edit of edits) edit();
  return generate(root);
}

export function rewriteStylesheet(
  css: string,
  opts: { map: UrlMapper; theme?: Theme; facts?: StyleFacts },
): string {
  const root = parseCss(css, "stylesheet");
  return root ? rewrite(root, css, opts.map, opts.theme, opts.facts) : "";
}

export function rewriteDeclarations(
  css: string,
  opts: { map: UrlMapper; facts?: StyleFacts },
): string {
  const root = parseCss(css, "declarationList");
  return root ? rewrite(root, css, opts.map, undefined, opts.facts) : "";
}

export function rewriteValue(css: string, map: UrlMapper): string {
  const root = parseCss(css, "value");
  return root ? rewrite(root, css, map, undefined, undefined) : "";
}

export function declaredValues(style: string): Map<string, string> {
  const values = new Map<string, string>();
  if (!style.trim()) return values;
  const root = parseCss(style, "declarationList");
  if (!root) return values;
  walk(root, {
    visit: "Declaration",
    enter(node) {
      if (node.value.type === "Raw") return;
      values.set(decoded(node.property), generate(node.value).trim());
    },
  });
  return values;
}

export type { StyleFacts };
