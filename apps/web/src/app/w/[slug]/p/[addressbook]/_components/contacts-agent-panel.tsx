"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@metis/ui/components/button";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { AlertTriangle, Bot, UserRound, X } from "lucide-react";
import { useMemo } from "react";

import { type AgentContact, TURN_PART_TYPE, viewerTimeZone } from "@/ai/turn";
import { AgentChatMessage } from "@/components/agent/agent-chat-message";
import {
  AttachmentChips,
  AttachmentPicker,
  useAttachmentTray,
} from "@/components/agent/turn-attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { primaryEmail } from "@/contacts/fields";
import type { ContactDto } from "@/server/schema";

import { useContacts } from "./contacts-context";

const SUGGESTIONS = [
  "Who works at the same company as this contact?",
  "Find everyone without a phone number",
  "Add a contact for the person I'm looking at",
  "Fix the name on this contact",
];

function toAgentContact(contact: ContactDto): AgentContact {
  return {
    addressBookId: contact.accountId ?? "",
    bookId: contact.bookId,
    contactId: contact.id,
    name: contact.name.display,
    ...(primaryEmail(contact) ? { email: primaryEmail(contact) } : {}),
    ...(contact.bookName ? { bookName: contact.bookName } : {}),
  };
}

function chipId(contact: AgentContact): string {
  return `${contact.addressBookId}:${contact.bookId}:${contact.contactId}`;
}

export function ContactsAgentPanel({ onClose }: { onClose: () => void }) {
  const { scope, selected, contacts, openContact, refresh } = useContacts();
  const open = useMemo(() => {
    if (!selected) return null;
    const contact = toAgentContact(selected);
    return { ...contact, id: chipId(contact) };
  }, [selected]);
  const { entries, add, pin, remove, reset } = useAttachmentTray<AgentContact & { id: string }>(
    open,
  );

  const chips = entries.map((e) => ({
    id: e.item.id,
    title: e.item.name || e.item.email || "Contact",
    subtitle: e.item.email ?? e.item.bookName ?? "",
    origin: e.origin,
  }));

  const attachable = contacts
    .map(toAgentContact)
    .filter((c) => !entries.some((e) => e.item.id === chipId(c)))
    .slice(0, 50)
    .map((c) => ({
      id: chipId(c),
      title: c.name || c.email || "Contact",
      subtitle: c.email ?? "",
    }));

  function pickAttachment(id: string) {
    const found = contacts.map(toAgentContact).find((c) => chipId(c) === id);
    if (found) add({ ...found, id });
  }

  function openChip(id: string) {
    const attached = entries.find((e) => e.item.id === id)?.item;
    if (attached) {
      openContact({
        id: attached.contactId,
        bookId: attached.bookId,
        accountId: attached.addressBookId,
      });
    }
  }

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/contacts-chat", body: scope }),
    [scope],
  );

  const { messages, sendMessage, status, error, regenerate, stop, addToolApprovalResponse } =
    useChat({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (err) => console.error("[contacts-agent] chat error:", err),
      onFinish: () => void refresh(),
    });

  function sendText(text: string) {
    void sendMessage({
      parts: [
        { type: "text", text },
        {
          type: TURN_PART_TYPE,
          data: {
            kind: "contacts",
            sentAt: new Date().toISOString(),
            timeZone: viewerTimeZone(),
            contacts: entries.map(({ item: { id: _id, ...contact } }) => contact),
          },
        },
      ],
    });
    reset();
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel">
      <div className="flex items-center gap-2.5 border-border-soft border-b px-4 py-3.5">
        <div className="flex-1">
          <p className="font-medium font-serif text-[16px] text-foreground">Contacts AI</p>
          <p className="text-[11px] text-faint">
            {scope.addressBookSlug === "all" ? "All address books" : "This address book"}
          </p>
        </div>
        <Button aria-label="Close assistant" onClick={onClose} size="icon-sm" variant="ghost">
          <X className="size-4" />
        </Button>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="Ask anything about these contacts."
              icon={<Bot className="size-10 opacity-40" />}
              title="Contacts AI"
            >
              <div className="flex flex-col items-center gap-3">
                <Bot className="size-10 text-faint opacity-40" />
                <p className="font-serif text-muted-foreground text-sm">Ask about your contacts</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <Suggestion className="rounded-md" key={s} onClick={sendText} suggestion={s} />
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <AgentChatMessage
                key={message.id}
                message={message}
                onApproval={addToolApprovalResponse}
              />
            ))
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
                <div className="flex-1">
                  <p className="font-medium text-destructive-text text-sm">
                    Contacts AI hit a problem
                  </p>
                  <p className="mt-1 wrap-break-word text-destructive-muted text-xs">
                    {error.message}
                  </p>
                  <Button className="mt-2" onClick={() => regenerate()} size="sm" variant="outline">
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-border-soft border-t p-3">
        <AttachmentChips
          chips={chips}
          className="mb-2"
          icon={UserRound}
          onClear={reset}
          onOpen={openChip}
          onPin={pin}
          onRemove={remove}
        />
        {messages.length > 0 && (
          <Suggestions className="mb-2">
            {SUGGESTIONS.map((s) => (
              <Suggestion key={s} onClick={sendText} suggestion={s} />
            ))}
          </Suggestions>
        )}
        <PromptInput
          onSubmit={(message) => {
            const text = message.text.trim();
            if (text) sendText(text);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea className="text-sm" placeholder="Ask about your contacts…" />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex items-center gap-1">
              <AttachmentPicker
                disabled={attachable.length === 0}
                emptyLabel="No contacts in view"
                icon={UserRound}
                items={attachable}
                onPick={pickAttachment}
                placeholder="Attach a contact…"
                title="Attach a contact"
              />
              <span className="text-[11px] text-faint pointer-coarse:hidden">Enter to send</span>
            </div>
            <PromptInputSubmit onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
