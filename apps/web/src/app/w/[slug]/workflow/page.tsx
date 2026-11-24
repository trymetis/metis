import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { workflowEditPath } from "@/workspace/path";

import { WorkflowList } from "./_components/workflow-list";

export default async function WorkflowPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/workflow">) {
  const { slug } = await params;
  const { id } = await searchParams;
  const appUser = await getAppUser(await headers(), slug);
  if (!isWorkspaceUser(appUser)) redirect("/");
  if (typeof id === "string") redirect(workflowEditPath(slug, id));

  return <WorkflowList />;
}
