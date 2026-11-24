"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { type Editor, useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Italic,
  List,
  ListOrdered,
  Loader2,
  MessageCircleQuestion,
  Quote,
  Redo2,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  UnderlineIcon,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";

import type { REPLY_STANCES, REWRITE_MODES } from "@/server/schema";

export type RewriteMode = (typeof REWRITE_MODES)[number];
export type ReplyStance = (typeof REPLY_STANCES)[number];

const ALIGNMENTS = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
  { value: "justify", label: "Justify", icon: AlignJustify },
] as const;

const REWRITES: { mode: RewriteMode; label: string }[] = [
  { mode: "rewrite", label: "Rewrite" },
  { mode: "shorten", label: "Shorten" },
  { mode: "formal", label: "More formal" },
  { mode: "friendly", label: "Friendlier" },
];

const STANCES: { key: ReplyStance; label: string }[] = [
  { key: "accept", label: "Accept" },
  { key: "decline", label: "Polite decline" },
  { key: "negotiate", label: "Negotiate" },
  { key: "buy_time", label: "Buy time" },
  { key: "clarify", label: "Clarify" },
  { key: "defer", label: "Defer" },
];

function BarBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(active ? "bg-hover text-foreground" : "text-faint")}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border-soft" />;
}

export function ComposeFormattingBar({
  editor,
  link,
  ai,
  rewriting,
  busy,
  onRewrite,
  stance,
}: {
  editor: Editor | null;
  link: ReactNode;
  ai: boolean;
  rewriting: boolean;
  busy: boolean;
  onRewrite: (mode: RewriteMode) => void;
  stance: { loading: ReplyStance | null; onPick: (stance: ReplyStance) => void } | null;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            underline: current.isActive("underline"),
            strike: current.isActive("strike"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            blockquote: current.isActive("blockquote"),
            code: current.isActive("code"),
            align:
              ALIGNMENTS.find((a) => current.isActive({ textAlign: a.value }))?.value ?? "left",
            canUndo: current.can().undo(),
            canRedo: current.can().redo(),
            hasSelection: !current.state.selection.empty,
          }
        : null,
  });
  const run = (apply: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    if (editor) apply(editor.chain().focus()).run();
  };
  const alignment = ALIGNMENTS.find((a) => a.value === state?.align) ?? ALIGNMENTS[0];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border-soft px-4 py-1.5"
    >
      <BarBtn label="Bold" active={state?.bold} onClick={() => run((c) => c.toggleBold())}>
        <Bold className="size-3.5" strokeWidth={2.5} />
      </BarBtn>
      <BarBtn label="Italic" active={state?.italic} onClick={() => run((c) => c.toggleItalic())}>
        <Italic className="size-3.5" strokeWidth={2.5} />
      </BarBtn>
      <BarBtn
        label="Underline"
        active={state?.underline}
        onClick={() => run((c) => c.toggleUnderline())}
      >
        <UnderlineIcon className="size-3.5" strokeWidth={2.5} />
      </BarBtn>
      <BarBtn
        label="Strikethrough"
        active={state?.strike}
        onClick={() => run((c) => c.toggleStrike())}
      >
        <Strikethrough className="size-3.5" />
      </BarBtn>
      <Divider />
      <BarBtn
        label="Bullet list"
        active={state?.bulletList}
        onClick={() => run((c) => c.toggleBulletList())}
      >
        <List className="size-3.5" />
      </BarBtn>
      <BarBtn
        label="Numbered list"
        active={state?.orderedList}
        onClick={() => run((c) => c.toggleOrderedList())}
      >
        <ListOrdered className="size-3.5" />
      </BarBtn>
      <BarBtn
        label="Quote"
        active={state?.blockquote}
        onClick={() => run((c) => c.toggleBlockquote())}
      >
        <Quote className="size-3.5" />
      </BarBtn>
      <BarBtn label="Code" active={state?.code} onClick={() => run((c) => c.toggleCode())}>
        <Code className="size-3.5" />
      </BarBtn>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Alignment"
              title="Alignment"
              className="gap-0.5 px-1.5 text-faint"
            >
              <alignment.icon className="size-3.5" />
              <ChevronDown className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {ALIGNMENTS.map((a) => (
            <DropdownMenuItem key={a.value} onClick={() => run((c) => c.setTextAlign(a.value))}>
              <a.icon className="mr-2 size-3.5" />
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {link}
      <Divider />
      <BarBtn label="Undo" disabled={!state?.canUndo} onClick={() => run((c) => c.undo())}>
        <Undo2 className="size-3.5" />
      </BarBtn>
      <BarBtn label="Redo" disabled={!state?.canRedo} onClick={() => run((c) => c.redo())}>
        <Redo2 className="size-3.5" />
      </BarBtn>
      <BarBtn label="Clear formatting" onClick={() => run((c) => c.unsetAllMarks().clearNodes())}>
        <RemoveFormatting className="size-3.5" />
      </BarBtn>
      {(ai || stance) && <Divider />}
      {ai && (
        <span
          className="inline-flex"
          title={
            busy && !rewriting
              ? "Wait for Stance to finish"
              : state?.hasSelection
                ? "Edit the selected text with AI"
                : "Select text to edit it with AI"
          }
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || !state?.hasSelection}
                  className="gap-1 px-2 text-[12px] text-muted-foreground"
                >
                  {rewriting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Rewrite
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {REWRITES.map((r) => (
                <DropdownMenuItem key={r.mode} onClick={() => onRewrite(r.mode)}>
                  {r.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
      {stance && (
        <span
          className="inline-flex"
          title={
            busy && stance.loading === null
              ? "Wait for Rewrite to finish"
              : "Write the reply in a stance, from what you typed so far"
          }
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="gap-1 px-2 text-[12px] text-muted-foreground"
                >
                  {stance.loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <MessageCircleQuestion className="size-3.5" />
                  )}
                  Stance
                  <ChevronDown className="size-3" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {STANCES.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => stance.onPick(s.key)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </div>
  );
}
