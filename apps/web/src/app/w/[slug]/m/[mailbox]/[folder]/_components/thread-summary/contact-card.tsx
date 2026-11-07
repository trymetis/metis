"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BookUser,
  Download,
  Globe,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { downloadVcard } from "@/components/contacts/download-vcard";
import { matchHref, useSaveContact } from "@/components/contacts/use-save-contact";
import { emptyDraft } from "@/contacts/fields";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { route } from "@/lib/route";
import type { SummaryCardProps } from "@/mail/summary-catalog";
import type { ContactDraft } from "@/server/schema";

import {
  Actions,
  CardAction,
  CardLink,
  CardShell,
  CopyButton,
  Detail,
  Details,
  Title,
} from "./card-parts";
import { directionsUrl } from "./format";

type ContactProps = SummaryCardProps<"Contact">;

function toDraft(props: ContactProps): ContactDraft {
  return {
    ...emptyDraft(),
    name: { display: props.name },
    ...(props.organization ? { organization: props.organization } : {}),
    ...(props.title ? { title: props.title } : {}),
    emails: props.emails.map((value, index) => ({
      value,
      ...(index === 0 ? { primary: true } : {}),
    })),
    phones: props.phones.map((value) => ({ value })),
    addresses: props.addresses.map((street) => ({ street })),
    urls: props.websiteUrl ? [{ value: props.websiteUrl }] : [],
    ...(props.note ? { notes: props.note } : {}),
  };
}

export function ContactCard({ props }: { props: ContactProps }) {
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const saveContact = useSaveContact();
  const emails = props.emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const lookup = useQuery({
    ...rpc.contacts.lookup.queryOptions({ input: { workspaceSlug, emails } }),
    enabled: emails.length > 0,
    staleTime: 60_000,
  });
  const saved = lookup.data?.matches[0];
  const role = [props.title, props.organization].filter(Boolean).join(" · ");
  const [email] = props.emails;
  const [phone] = props.phones;
  const directions = directionsUrl(props.addresses[0]);
  return (
    <CardShell icon={UserRound} label="Contact">
      <Title>{props.name}</Title>
      {role && <p className="text-[12px] text-muted-foreground">{role}</p>}
      <Details columns="two">
        {props.emails.length > 0 && (
          <Detail icon={Mail} label="Email">
            {props.emails.join(", ")}
          </Detail>
        )}
        {props.phones.length > 0 && (
          <Detail icon={Phone} label="Phone">
            {props.phones.join(", ")}
          </Detail>
        )}
        {props.addresses.map((address) => (
          <Detail key={address} icon={MapPin} label="Address" wide>
            {address}
          </Detail>
        ))}
        {props.note && (
          <Detail icon={StickyNote} label="Note" wide>
            {props.note}
          </Detail>
        )}
      </Details>
      <Actions>
        {saved ? (
          <CardAction
            intent="primary"
            icon={BookUser}
            onClick={() => router.push(route(matchHref(workspaceSlug, saved)))}
          >
            Open contact
          </CardAction>
        ) : (
          <CardAction
            intent="primary"
            icon={UserPlus}
            onClick={() => saveContact.save(toDraft(props))}
          >
            Save contact
          </CardAction>
        )}
        <CardAction
          icon={Download}
          onClick={() => downloadVcard(toDraft(props), crypto.randomUUID())}
        >
          Download
        </CardAction>
        {email && (
          <CardLink href={`mailto:${email}`} icon={Mail}>
            Email
          </CardLink>
        )}
        {email && <CopyButton text={email} label="Copy email" />}
        {phone && (
          <CardLink href={`tel:${phone.replace(/[^\d+]/g, "")}`} icon={Phone}>
            Call
          </CardLink>
        )}
        {props.websiteUrl && (
          <CardLink href={props.websiteUrl} icon={Globe}>
            Website
          </CardLink>
        )}
        {directions && (
          <CardLink href={directions} icon={MapPin}>
            Directions
          </CardLink>
        )}
      </Actions>
      {saveContact.dialog}
    </CardShell>
  );
}
