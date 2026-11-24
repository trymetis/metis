"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { Label } from "@metis/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { browserTimezone, directoryResources } from "@/components/workflow-graph/resources";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { WorkflowDirectory } from "@/server/schema";
import {
  GRAPH_TEMPLATES,
  type GraphTemplate,
  TEMPLATE_LABELS,
  templateGraph,
} from "@/workflow/graph";
import { workflowEditPath } from "@/workspace/path";

const TEMPLATE_ITEMS = GRAPH_TEMPLATES.map((value) => ({ value, label: TEMPLATE_LABELS[value] }));

export function NewWorkflowDialog({
  open,
  onOpenChange,
  directory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: WorkflowDirectory;
}) {
  const scope = useWorkspaceScope();
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<GraphTemplate>("blank");
  const [creating, setCreating] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const result = await orpc.workflows.create({
        ...scope,
        workflow: {
          name: trimmed,
          enabled: false,
          graph: templateGraph("blank", directoryResources(directory, browserTimezone())),
        },
      });
      if (!result.workflow) throw new Error("Could not create the workflow");
      const href = workflowEditPath(scope.workspaceSlug, result.workflow.id);
      router.push(
        template === "blank" ? href : (`${href}?template=${encodeURIComponent(template)}` as Route),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the workflow");
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (creating) return;
        onOpenChange(next);
        if (!next) {
          setName("");
          setTemplate("blank");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            It starts turned off. The template opens in the editor for you to finish and save.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-workflow-name">Name</Label>
            <Input
              id="new-workflow-name"
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Label invoices from suppliers"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Template</Label>
            <Select
              items={TEMPLATE_ITEMS}
              value={template}
              onValueChange={(next) => {
                if (next) setTemplate(next);
              }}
            >
              <SelectTrigger aria-label="Template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating && <Loader2 className="animate-spin" />}
              Create workflow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
