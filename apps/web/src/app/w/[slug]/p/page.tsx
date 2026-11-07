import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { AttachResourceCard } from "@/components/attach-resource-card";
import { firstAddressBookSlug } from "@/contacts/session";
import { ALL_ADDRESS_BOOKS_SLUG, contactsPath } from "@/workspace/path";

export default async function ContactsIndexPage({ params }: PageProps<"/w/[slug]/p">) {
  const { slug } = await params;
  const appUser = await getAppUser(await headers(), slug);
  if (!appUser) redirect("/");
  if (!isWorkspaceUser(appUser)) redirect("/");

  const first = await firstAddressBookSlug(appUser.workspaceId);
  if (first) redirect(contactsPath(slug, ALL_ADDRESS_BOOKS_SLUG));

  return <AttachResourceCard resource="addressbook" workspaceSlug={slug} />;
}
