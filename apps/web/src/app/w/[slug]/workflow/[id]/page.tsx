import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { decisionEnabled } from "@/config/runtime";
import { GRAPH_TEMPLATES, type GraphTemplate } from "@/workflow/graph";

import { WorkflowEditorPage } from "./_components/workflow-editor-page";

function isTemplate(value: unknown): value is GraphTemplate {
  return typeof value === "string" && (GRAPH_TEMPLATES as readonly string[]).includes(value);
}

export default async function WorkflowEditRoute({
  params,
  searchParams,
}: PageProps<"/w/[slug]/workflow/[id]">) {
  const { slug, id } = await params;
  const { template } = await searchParams;
  const appUser = await getAppUser(await headers(), slug);
  if (!isWorkspaceUser(appUser)) redirect("/");

  return (
    <WorkflowEditorPage
      key={id}
      workflowId={id}
      template={isTemplate(template) && template !== "blank" ? template : null}
      allowDecisionSteps={decisionEnabled("workflowNode")}
    />
  );
}
