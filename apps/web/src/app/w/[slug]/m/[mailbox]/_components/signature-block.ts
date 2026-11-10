"use client";

import { type Editor, Node } from "@tiptap/react";

import { sanitizeSignatureHtml } from "@/lib/sanitize-html";
import { SIGNATURE_ATTR } from "@/mail/signature-markup";

export const SIGNATURE_NODE = "mailSignature";

export interface InsertedSignature {
  id: string;
  html: string;
}

export const SignatureBlock = Node.create({
  name: SIGNATURE_NODE,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      signatureId: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute(SIGNATURE_ATTR) ?? "",
        renderHTML: () => ({}),
      },
      html: {
        default: "",
        parseHTML: (element: HTMLElement) => element.innerHTML,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${SIGNATURE_ATTR}]` }];
  },

  renderHTML({ node }) {
    const dom = document.createElement("div");
    dom.setAttribute(SIGNATURE_ATTR, String(node.attrs.signatureId ?? ""));
    dom.innerHTML = sanitizeSignatureHtml(String(node.attrs.html ?? ""));
    return dom;
  },
});

function findSignature(editor: Editor): { pos: number; size: number } | null {
  let found: { pos: number; size: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === SIGNATURE_NODE) {
      found = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  return found;
}

export function hasSignature(editor: Editor): boolean {
  return findSignature(editor) !== null;
}

export function setSignature(editor: Editor, signature: InsertedSignature | null): void {
  const { state } = editor;
  const type = state.schema.nodes[SIGNATURE_NODE];
  if (!type) return;
  const existing = findSignature(editor);
  const tr = state.tr;
  if (existing) {
    if (signature) {
      tr.replaceWith(
        existing.pos,
        existing.pos + existing.size,
        type.create({ signatureId: signature.id, html: signature.html }),
      );
    } else {
      tr.delete(existing.pos, existing.pos + existing.size);
    }
  } else if (signature) {
    tr.insert(
      state.doc.content.size,
      type.create({ signatureId: signature.id, html: signature.html }),
    );
  } else {
    return;
  }
  editor.view.dispatch(tr);
}

export function typedText(editor: Editor): string {
  let text = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name === SIGNATURE_NODE) return false;
    if (node.isText) text += node.text ?? "";
    return true;
  });
  return text.trim();
}
