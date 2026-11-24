import { redirect } from "next/navigation";

import { workflowRunPath } from "@/workspace/path";

export default async function WorkflowHistoryRunPage({
  params,
}: PageProps<"/w/[slug]/workflow/history/[runId]">) {
  const { slug, runId } = await params;
  redirect(workflowRunPath(slug, runId));
}
