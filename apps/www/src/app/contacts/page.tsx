import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/contacts");

const POSES: Pose[] = [
  { yaw: -24, pitch: 16, dist: 7.6, target: [0, 0.6, 0] },
  { yaw: -8, pitch: 12, dist: 6.8, target: [0, 0.75, 0] },
  { yaw: 14, pitch: 20, dist: 7.2, target: [0.4, 0.9, 0.6] },
  { yaw: -4, pitch: 8, dist: 5.4, target: [0, 1.05, 0.9] },
];

export default function ContactsPage() {
  return (
    <>
      <PageJsonLd path="/contacts" />
      <Exhibit
        model="cardholder"
        headline="One contacts app for Google Contacts, Outlook, Zoho Contacts and CardDAV address books"
        poses={POSES}
        plates={[
          {
            label: "Contacts",
            title: (
              <>
                People, <em>next to the mail.</em>
              </>
            ),
            text: "Every address book in the workspace in one list, beside the mail, calendars and files you share with the people in it.",
          },
          {
            label: "Sources",
            title: (
              <>
                Every address book, <em>one list.</em>
              </>
            ),
            text: "Google, Outlook and Zoho contacts come with the account you connect. CardDAV address books come from servers the instance owner adds.",
            chips: [
              { label: "Google Contacts" },
              { label: "Outlook" },
              { label: "Zoho Contacts" },
              { label: "CardDAV" },
            ],
          },
          {
            label: "From mail",
            title: (
              <>
                Save them <em>where you meet them.</em>
              </>
            ),
            text: "Add anyone on an email to the address book you pick, or save the person a summary found, with their details filled in.",
          },
          {
            label: "Agent",
            title: (
              <>
                Tidy up, <em>with your approval.</em>
              </>
            ),
            text: "Ask the contacts agent who works where, or have it add and fix contacts. Every change waits for you to approve it.",
          },
        ]}
      />
      <FeatureArea area="contacts" link={false} />
    </>
  );
}
