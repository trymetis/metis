"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { CalendarDays, Mail } from "lucide-react";

import { hasReferences } from "@/ai/references";
import { TURN_PART_TYPE, turnEnvelopeSchema } from "@/ai/turn";

import { Message, MessageContent, MessageResponse } from "../ai-elements/message";
import { AgentToolGroup, type AnyToolPart, isInternalTool } from "./agent-tool-call";
import { ReferenceText } from "./references/reference-text";
import { AttachmentChips } from "./turn-attachments";

function turnChips(data: unknown) {
  const envelope = turnEnvelopeSchema.safeParse(data).data;
  if (envelope?.kind === "mail" && envelope.emails.length > 0) {
    return {
      icon: Mail,
      chips: envelope.emails.map((e) => ({
        id: e.id,
        title: e.subject,
        subtitle: e.from,
      })),
    };
  }
  if (envelope?.kind === "calendar" && envelope.events.length > 0) {
    return {
      icon: CalendarDays,
      chips: envelope.events.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.calendarName,
      })),
    };
  }
  return null;
}

type Block =
  | { kind: "part"; part: UIMessage["parts"][number]; index: number }
  | { kind: "tools"; parts: AnyToolPart[] };

function toBlocks(parts: UIMessage["parts"]): Block[] {
  const blocks: Block[] = [];
  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      if (isInternalTool(part)) return;
      const prev = blocks.at(-1);
      if (prev?.kind === "tools") prev.parts.push(part);
      else blocks.push({ kind: "tools", parts: [part] });
      return;
    }
    if (part.type === "step-start") return;
    blocks.push({ kind: "part", part, index });
  });
  return blocks;
}

export function AgentChatMessage({ message }: { message: UIMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {toBlocks(message.parts).map((block) => {
          if (block.kind === "tools") {
            // oxlint-disable-next-line typescript/no-non-null-assertion --a tools block always holds at least one part
            const first = block.parts[0]!;
            return <AgentToolGroup key={first.toolCallId} parts={block.parts} />;
          }
          const { part, index } = block;
          if (part.type === TURN_PART_TYPE) {
            const turn = turnChips("data" in part ? part.data : undefined);
            if (!turn) return null;
            return (
              <AttachmentChips
                chips={turn.chips}
                className="mb-1.5"
                icon={turn.icon}
                key={`${message.id}-turn${index}`}
                variant="transcript"
              />
            );
          }
          if (part.type === "text") {
            if (message.role === "user" && hasReferences(part.text)) {
              return <ReferenceText key={`${message.id}-t${index}`} text={part.text} />;
            }
            return <MessageResponse key={`${message.id}-t${index}`}>{part.text}</MessageResponse>;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
