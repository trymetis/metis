import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { ScopePolicyProvider } from "@/components/scope-policy-context";
import { firstAddressBookSlug, getAddressBookSession } from "@/contacts/session";
import { getWorkspacePolicy } from "@/workspace";
import { contactsPath, workspaceSettingsPath } from "@/workspace/path";
import { scopePolicy } from "@/workspace/policy";
import { addressBookTitle } from "@/workspace/titles";

export async function generateMetadata({
  params,
}: LayoutProps<"/w/[slug]/p/[addressbook]">): Promise<Metadata> {
  const { slug, addressbook } = await params;
  const label = await addressBookTitle(await headers(), slug, addressbook);
  return { title: label ? `Contacts · ${label}` : "Contacts" };
}

export default async function ContactsLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/p/[addressbook]">) {
  const { slug, addressbook } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.workspaceId || !appUser.workspaceRole || !appUser.workspaceSlug) {
    redirect("/");
  }

  const session = await getAddressBookSession(h, slug, addressbook);
  if (!session) {
    const first = await firstAddressBookSlug(appUser.workspaceId);
    if (first && first !== addressbook) redirect(contactsPath(slug, first));
    redirect(workspaceSettingsPath(slug, "contacts"));
  }

  const workspacePolicy = await getWorkspacePolicy(appUser.workspaceId);
  if (!workspacePolicy) notFound();

  return (
    <ScopePolicyProvider policy={scopePolicy(workspacePolicy, session.accounts)}>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </ScopePolicyProvider>
  );
}
