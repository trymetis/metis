"use client";

import { cn } from "@metis/ui/lib/utils";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isSerializableReferenceId, type ResolvedReference } from "@/ai/references";
import { isCoarsePointer } from "@/hooks/use-is-mobile";
import { orpc } from "@/lib/orpc";
import { rateLimitWait } from "@/lib/rate-limit-message";

import { ReferenceMenu, type ReferenceMenuState } from "./reference-menu";
import {
  AgentReferenceNode,
  type AgentReferenceOptions,
  REFERENCE_NODE_NAME,
  toReferenceAttrs,
} from "./reference-node";
import { useAgentReferences } from "./reference-provider";

const SUGGEST_LIMIT = 6;
const SUGGEST_DEBOUNCE_MS = 250;

const CLOSED: ReferenceMenuState = {
  open: false,
  items: [],
  index: 0,
  loading: false,
  query: "",
  getRect: null,
};

type SuggestionConfig = AgentReferenceOptions["suggestion"];

interface MenuBridge {
  open: boolean;
  items: ResolvedReference[];
  index: number;
  command: ((attrs: ReturnType<typeof toReferenceAttrs>) => void) | null;
}

export function ReferenceComposer({
  placeholder = "Ask anything…  @ to reference",
  label = "Message",
  className,
  initialReferences,
}: {
  placeholder?: string;
  label?: string;
  className?: string;
  initialReferences?: ResolvedReference[];
}) {
  const references = useAgentReferences();
  const [menu, setMenu] = useState<ReferenceMenuState>(CLOSED);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const bridge = useRef<MenuBridge>({
    open: false,
    items: [],
    index: 0,
    command: null,
  });

  const limitedUntil = useRef(0);

  const scopeRef = useRef(references);
  useEffect(() => {
    scopeRef.current = references;
  });

  const submit = useCallback(() => {
    inputRef.current?.form?.requestSubmit();
  }, []);

  const close = useCallback(() => {
    bridge.current = { open: false, items: [], index: 0, command: null };
    setMenu(CLOSED);
  }, []);

  const select = useCallback((item: ResolvedReference) => {
    scopeRef.current?.remember(item);
    bridge.current.command?.(toReferenceAttrs(item));
  }, []);

  const move = useCallback((delta: number) => {
    const { items, index } = bridge.current;
    if (items.length === 0) return;
    const next = (index + delta + items.length) % items.length;
    bridge.current.index = next;
    setMenu((prev) => ({ ...prev, index: next }));
  }, []);

  const openWith = useCallback(
    (props: {
      items: ResolvedReference[];
      query: string;
      clientRect?: (() => DOMRect | null) | null;
      command: (attrs: ReturnType<typeof toReferenceAttrs>) => void;
    }) => {
      if (Date.now() < limitedUntil.current) {
        close();
        return;
      }
      bridge.current = {
        open: true,
        items: props.items,
        index: 0,
        command: props.command,
      };
      setMenu({
        open: true,
        items: props.items,
        index: 0,
        loading: false,
        query: props.query,
        getRect: props.clientRect ?? null,
      });
    },
    [close],
  );

  const pending = useRef<{
    seq: number;
    timer: ReturnType<typeof setTimeout> | null;
    abandon: (() => void) | null;
  }>({ seq: 0, timer: null, abandon: null });

  const fetchItems = useCallback((query: string): Promise<ResolvedReference[]> => {
    const scope = scopeRef.current;
    if (!scope) return Promise.resolve([]);

    const p = pending.current;
    if (p.timer) clearTimeout(p.timer);
    p.abandon?.();

    const ticket = ++p.seq;
    setMenu((prev) => (prev.open ? { ...prev, loading: true } : prev));

    return new Promise<ResolvedReference[]>((resolve) => {
      p.abandon = () => resolve([]);
      p.timer = setTimeout(async () => {
        try {
          const { groups } = await orpc.agentReferences.suggest({
            workspaceSlug: scope.workspaceSlug,
            query,
            limit: SUGGEST_LIMIT,
          });
          if (ticket !== p.seq) return resolve([]);
          resolve(
            groups
              .flatMap((group) => group.items)
              .filter((item) => isSerializableReferenceId(item.id)),
          );
        } catch (err) {
          const wait = rateLimitWait(err);
          if (wait === null) console.error("[agent-references] suggest failed:", err);
          else limitedUntil.current = Date.now() + wait * 1000;
          resolve([]);
        }
      }, SUGGEST_DEBOUNCE_MS);
    });
  }, []);

  const composerKeys = useMemo(
    () =>
      Extension.create({
        name: "agentReferenceComposerKeys",
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              const item = bridge.current.open
                ? bridge.current.items[bridge.current.index]
                : undefined;
              if (item) select(item);
              else if (isCoarsePointer()) editor.commands.setHardBreak();
              else submit();
              return true;
            },
            "Shift-Enter": ({ editor }) => editor.commands.setHardBreak(),
            ArrowUp: () => {
              if (!bridge.current.open) return false;
              move(-1);
              return true;
            },
            ArrowDown: () => {
              if (!bridge.current.open) return false;
              move(1);
              return true;
            },
            Escape: () => {
              if (!bridge.current.open) return false;
              close();
              return true;
            },
          };
        },
      }),
    [select, submit, move, close],
  );

  const suggestion = useMemo<SuggestionConfig>(
    () => ({
      char: "@",
      allowSpaces: false,
      allow: () => Date.now() >= limitedUntil.current,
      items: ({ query }) => fetchItems(query),
      render: () => ({
        onStart: openWith,
        onUpdate: openWith,
        onExit: close,
      }),
    }),
    [fetchItems, openWith, close],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder }),
      composerKeys,
      // oxlint-disable-next-line react/refs -- configure only stores the suggestion callbacks; Tiptap calls them on typing, not during render
      AgentReferenceNode.configure({
        deleteTriggerWithBackspace: true,
        suggestion,
      }),
    ],
    [placeholder, composerKeys, suggestion],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class:
          "max-h-48 min-h-16 w-full overflow-y-auto px-3 py-2 text-sm leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor: instance }) => {
      setText(instance.getText({ blockSeparator: "\n" }));
    },
  });

  const seeded = useRef(false);
  useEffect(() => {
    if (!editor || seeded.current || !initialReferences?.length) return;
    seeded.current = true;
    editor
      .chain()
      .focus("end")
      .insertContent(
        initialReferences.flatMap((item) => [
          { type: REFERENCE_NODE_NAME, attrs: toReferenceAttrs(item) },
          { type: "text", text: " " },
        ]),
      )
      .run();
  }, [editor, initialReferences]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || !editor) return;

    const onReset = () => {
      editor.commands.clearContent(true);
      setText("");
      close();
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [editor, close]);

  return (
    <div className={cn("w-full min-w-0 flex-1", className)} data-slot="input-group-control">
      <EditorContent editor={editor} />
      <input name="message" readOnly ref={inputRef} type="hidden" value={text} />
      <ReferenceMenu onClose={close} onSelect={select} state={menu} />
    </div>
  );
}
