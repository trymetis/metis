import { redirect } from "next/navigation";

import { workflowRunsPath } from "@/workspace/path";

export default async function WorkflowHistoryPage({
  params,
}: PageProps<"/w/[slug]/workflow/history">) {
  const { slug } = await params;
  redirect(workflowRunsPath(slug));
}
