/* oxlint-disable import/no-named-as-default-member -- isomorphic-dompurify's named removeHook drops the hook argument on the server, so hooks go through the instance */
import DOMPurify, { type Config, type UponSanitizeAttributeHook } from "isomorphic-dompurify";

const EMAIL_CONFIG: Config = {
  FORCE_BODY: true,
  FORBID_TAGS: [
    "script",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "base",
    "meta",
    "link",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "audio",
    "video",
    "track",
    "portal",
    "noscript",
    "animate",
    "animatemotion",
    "animatetransform",
    "animatecolor",
    "set",
    "discard",
  ],
  ADD_ATTR: ["target"],
};

const HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
  ],
  FORBID_ATTR: ["style", "target"],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
};

const dropEventHandlers: UponSanitizeAttributeHook = (_node, data) => {
  if (/^on/i.test(data.attrName)) data.keepAttr = false;
};

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

export function sanitizeEmailHtml(raw: string, visit?: (element: Element) => void): string {
  if (!raw) return "";
  const onElement = (node: Node) => {
    if (visit && isElement(node)) visit(node);
  };
  DOMPurify.addHook("uponSanitizeAttribute", dropEventHandlers);
  DOMPurify.addHook("afterSanitizeAttributes", onElement);
  try {
    return DOMPurify.sanitize(raw, EMAIL_CONFIG);
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes", onElement);
    DOMPurify.removeHook("uponSanitizeAttribute", dropEventHandlers);
  }
}

const SIGNATURE_CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    "style",
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "video",
    "audio",
    "base",
    "meta",
    "link",
  ],
  FORBID_ATTR: ["id", "class"],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
};

const httpsImagesOnly: UponSanitizeAttributeHook = (_node, data) => {
  if (/^on/i.test(data.attrName)) data.keepAttr = false;
  if (data.attrName === "src" && !/^https:\/\//i.test(data.attrValue.trim())) {
    data.keepAttr = false;
  }
  if (data.attrName === "srcset") data.keepAttr = false;
};

export function sanitizeSignatureHtml(raw: string): string {
  if (!raw) return "";
  DOMPurify.addHook("uponSanitizeAttribute", httpsImagesOnly);
  try {
    return DOMPurify.sanitize(raw, SIGNATURE_CONFIG).trim();
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", httpsImagesOnly);
  }
}

export function sanitizeHtml(raw: string): string {
  return raw ? DOMPurify.sanitize(raw, HTML_CONFIG) : "";
}
