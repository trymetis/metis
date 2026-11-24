import { WorkflowRunDetailView } from "@/components/workflow-history/workflow-run-detail";

export default async function WorkflowRunPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/workflow/runs/[runId]">) {
  const { runId } = await params;
  const { from } = await searchParams;
  return <WorkflowRunDetailView runId={runId} fromWorkflow={from === "workflow"} />;
}
