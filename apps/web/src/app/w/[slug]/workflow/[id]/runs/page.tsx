import { RunsView } from "@/components/workflow-history/runs-view";

export default async function WorkflowOwnRunsPage({
  params,
}: PageProps<"/w/[slug]/workflow/[id]/runs">) {
  const { id } = await params;
  return <RunsView workflowId={id} />;
}
