"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@metis/ui/components/resizable";
import { Sheet, SheetContent, SheetTitle } from "@metis/ui/components/sheet";
import { Switch } from "@metis/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metis/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FlaskConical,
  History,
  Keyboard,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";
import { z } from "zod";

import { ChordHint } from "@/components/chord-hint";
import { MobileAsideTrigger } from "@/components/mobile-aside";
import { ShortcutsHelp, type ShortcutRow } from "@/components/shortcuts-help";
import type { GraphOverlay } from "@/components/workflow-graph/overlay";
import { type ChordBindings, isTypingTarget, useChord } from "@/hooks/use-chord";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSavedLayout } from "@/hooks/use-saved-layout";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { WorkflowDirectory, WorkflowOutput } from "@/server/schema";
import { type GraphTemplate, templateGraph } from "@/workflow/graph";
import { edgeSchema, nodeSchema } from "@/workflow/schema";

import {
  DiagnosticsContext,
  diagnose,
  directoryResources,
  type EditorEnv,
  EditorEnvContext,
  type EditorWorkflowRef,
  OverlayContext,
  type OverlaySource,
  type OverlayState,
} from "./editor-context";
import {
  createEditorStore,
  EditorStoreContext,
  snapshotOf,
  useEditor,
  useEditorStore,
  useIsDirty,
} from "./editor-store";
import { InputsForm, type InputValues, triggerInputs } from "./inputs-form";
import { Inspector } from "./inspector";
import { LabelOptionsProvider } from "./label-options";
import { RevisionsSheet } from "./revisions-sheet";
import { RunsPanel } from "./runs-panel";
import { QuickAdd, StepPalette } from "./step-palette";
import { type ReplayTarget, TestPanel } from "./test-panel";
import { CanvasElementContext, useTidyLayout, WorkflowCanvas } from "./workflow-canvas";

export const WORKFLOW_CHORD_PREFIX = "w";

const isMac = () => typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);

export const WORKFLOW_UNCHORDED: ShortcutRow[] = [
  [["Ctrl/⌘", "S"], "Save"],
  [["Ctrl/⌘", "Z"], "Undo"],
  [["Ctrl/⌘", "Shift", "Z"], "Redo"],
  [["Ctrl/⌘", "C"], "Copy the selected steps"],
  [["Ctrl/⌘", "V"], "Paste steps"],
  [["Ctrl/⌘", "D"], "Duplicate the selected steps"],
  [["Delete"], "Remove the selected steps or connections"],
];

const CLIPBOARD_TAG = "metis-workflow-steps/v1";
const PASTE_OFFSET = { x: 48, y: 48 };
const clipboardSchema = z.object({
  tag: z.literal(CLIPBOARD_TAG),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

type Clipboard = Omit<z.infer<typeof clipboardSchema>, "tag">;
let memoryClipboard: Clipboard | null = null;

type DockTab = "runs" | "test";

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function togglePanel(ref: ReturnType<typeof usePanelRef>) {
  const panel = ref.current;
  if (!panel) return;
  if (panel.isCollapsed()) panel.expand();
  else panel.collapse();
}

interface WorkflowEditorProps {
  directory: WorkflowDirectory;
  allowDecisionSteps: boolean;
  workflows: readonly EditorWorkflowRef[];
  workflow: WorkflowOutput | null;
  template: GraphTemplate;
  onSaved: (workflow: WorkflowOutput) => void;
  onDeleted: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

function IconButton({
  label,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string;
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-1.5 opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function useClipboard() {
  const store = useEditorStore();
  const copy = useCallback(async () => {
    const { graph, selected } = store.getState();
    const chosen = new Set(selected);
    if (chosen.size === 0) return;
    const payload: Clipboard = {
      nodes: graph.nodes.filter((n) => chosen.has(n.id)),
      edges: graph.edges.filter((e) => chosen.has(e.source) && chosen.has(e.target)),
    };
    memoryClipboard = payload;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ tag: CLIPBOARD_TAG, ...payload }));
    } catch {}
  }, [store]);

  const paste = useCallback(async () => {
    let payload = memoryClipboard;
    try {
      const parsed = clipboardSchema.safeParse(JSON.parse(await navigator.clipboard.readText()));
      if (parsed.success) payload = parsed.data;
    } catch {}
    if (payload && payload.nodes.length > 0) {
      store.getState().paste(payload.nodes, payload.edges, PASTE_OFFSET);
    }
  }, [store]);

  const duplicate = useCallback(() => {
    const { graph, selected } = store.getState();
    const chosen = new Set(selected);
    if (chosen.size === 0) return;
    store.getState().paste(
      graph.nodes.filter((n) => chosen.has(n.id)),
      graph.edges.filter((e) => chosen.has(e.source) && chosen.has(e.target)),
      PASTE_OFFSET,
    );
  }, [store]);

  return { copy, paste, duplicate };
}

function EditorShell({
  directory,
  allowDecisionSteps,
  workflows,
  workflow,
  onSaved,
  onDeleted,
  onDirtyChange,
}: WorkflowEditorProps) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const store = useEditorStore();
  const isMobile = useIsMobile();
  const graph = useEditor((s) => s.graph);
  const name = useEditor((s) => s.name);
  const enabled = useEditor((s) => s.enabled);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const selectedCount = useEditor((s) => s.selected.length);
  const dirty = useIsDirty();
  const tidy = useTidyLayout();
  const clipboard = useClipboard();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const env = useMemo<EditorEnv>(
    () => ({
      workflowId: workflow?.id ?? null,
      workflow,
      directory,
      resources: directoryResources(directory, browserTimezone()),
      allowDecisionSteps,
      sources: new Map((workflow?.sources ?? []).map((s) => [s.triggerNodeId, s])),
      workflows,
    }),
    [workflow, directory, allowDecisionSteps, workflows],
  );
  const diagnostics = useMemo(() => diagnose(graph, env), [graph, env]);

  const [overlayState, setOverlayState] = useState<{
    overlay: GraphOverlay | null;
    source: OverlaySource | null;
    live: boolean;
  }>({ overlay: null, source: null, live: false });
  const show = useCallback(
    (source: OverlaySource, overlay: GraphOverlay, live: boolean) =>
      setOverlayState({ overlay, source, live }),
    [],
  );
  const clear = useCallback(
    () => setOverlayState({ overlay: null, source: null, live: false }),
    [],
  );
  const overlay = useMemo<OverlayState>(
    () => ({ ...overlayState, show, clear }),
    [overlayState, show, clear],
  );

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>("runs");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayTarget | null>(null);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [runInputs, setRunInputs] = useState<InputValues>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const paletteRef = usePanelRef();
  const inspectorRef = usePanelRef();
  const dockRef = usePanelRef();
  const columns = useSavedLayout("metis-workflow-editor-columns", [
    "palette",
    "center",
    "inspector",
  ]);
  const rows = useSavedLayout("metis-workflow-editor-rows", ["canvas", "dock"]);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const openDock = useCallback(
    (tab: DockTab) => {
      setDockTab(tab);
      const panel = dockRef.current;
      if (panel?.isCollapsed()) panel.expand();
    },
    [dockRef],
  );

  const focusFirstProblem = useCallback(() => {
    const first =
      diagnostics.general.length > 0
        ? undefined
        : store.getState().graph.nodes.find((n) => diagnostics.byNode.has(n.id));
    store.getState().select(first ? [first.id] : []);
    const panel = inspectorRef.current;
    if (panel?.isCollapsed()) panel.expand();
  }, [store, diagnostics, inspectorRef]);

  const save = useCallback(async () => {
    const snapshot = snapshotOf(store.getState());
    if (!snapshot.name.trim()) {
      toast.error("Give your workflow a name");
      return;
    }
    if (diagnostics.count > 0) {
      toast.error(
        diagnostics.count === 1
          ? "Fix the problem in this workflow before saving"
          : `Fix the ${diagnostics.count} problems in this workflow before saving`,
      );
      focusFirstProblem();
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...scope,
        workflow: { name: snapshot.name.trim(), enabled: snapshot.enabled, graph: snapshot.graph },
      };
      const result = workflow
        ? await orpc.workflows.update({ id: workflow.id, ...body })
        : await orpc.workflows.create(body);
      if (result.workflow) {
        store.getState().markSaved(snapshot);
        onSaved(result.workflow);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the workflow");
    } finally {
      setSaving(false);
    }
  }, [store, diagnostics, focusFirstProblem, scope, workflow, onSaved]);

  const manualTrigger = workflow?.graph.nodes.find((n) => n.step === "trigger.manual");
  const runnable = !!workflow?.graph.nodes.some(
    (n) => n.step === "trigger.manual" || n.step === "trigger.schedule",
  );
  const manualFields = triggerInputs(manualTrigger);

  const queueRun = useCallback(
    async (inputs?: InputValues) => {
      if (!workflow) return;
      setRunning(true);
      try {
        const result = await orpc.workflows.run({
          ...scope,
          id: workflow.id,
          ...(inputs ? { inputs } : {}),
        });
        if (dirty) toast.info("Running the saved version. Save to run your latest changes.");
        setSelectedRunId(result.runId);
        openDock("runs");
        await queryClient.invalidateQueries({ queryKey: rpc.workflows.runs.key() });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not queue a run");
      } finally {
        setRunning(false);
      }
    },
    [workflow, scope, dirty, openDock, queryClient],
  );

  const runNow = useCallback(() => {
    if (manualFields.length > 0) setInputsOpen(true);
    else void queueRun();
  }, [manualFields.length, queueRun]);

  async function doDelete() {
    if (!workflow) return;
    setConfirmDelete(false);
    try {
      await orpc.workflows.delete({ ...scope, id: workflow.id });
      store.getState().markSaved(snapshotOf(store.getState()));
      onDeleted(workflow.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the workflow");
    }
  }

  const bindings = useMemo<ChordBindings>(
    () => ({
      a: { label: "Add step", run: () => setQuickAdd(true) },
      l: { label: "Tidy up the layout", run: tidy },
      t: { label: "Test run", run: () => openDock("test") },
      r: { label: "Run now", run: runNow },
    }),
    [tidy, openDock, runNow],
  );
  const { armed, helpOpen, setHelpOpen } = useChord({
    prefix: WORKFLOW_CHORD_PREFIX,
    bindings,
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = isMac() ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void save();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (key === "y") {
        event.preventDefault();
        store.getState().redo();
      } else if (key === "c" && window.getSelection()?.isCollapsed !== false) {
        void clipboard.copy();
      } else if (key === "v") {
        void clipboard.paste();
      } else if (key === "d") {
        event.preventDefault();
        clipboard.duplicate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, store, clipboard]);

  const status = saving ? (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Loader2 className="size-3 animate-spin" /> Saving
    </span>
  ) : !workflow ? (
    <span className="text-muted-foreground">Not saved yet</span>
  ) : dirty ? (
    <span className="flex items-center gap-1.5 text-brand-text">
      <span className="size-1.5 rounded-full bg-brand-text" /> Unsaved changes
    </span>
  ) : (
    <span className="text-muted-foreground">Saved</span>
  );

  const topBar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-border border-b bg-panel px-2 py-1.5">
      <MobileAsideTrigger className="size-8 shrink-0" />
      {!isMobile && (
        <IconButton
          label={paletteOpen ? "Hide steps" : "Show steps"}
          onClick={() => togglePanel(paletteRef)}
        >
          {paletteOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
        </IconButton>
      )}
      <input
        value={name}
        onChange={(e) => store.getState().setName(e.target.value)}
        onFocus={() => store.getState().beginGesture()}
        onBlur={() => store.getState().endGesture()}
        placeholder="Untitled workflow"
        aria-label="Workflow name"
        className="w-44 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-[14px] text-foreground outline-none hover:border-border focus:border-primary/40 sm:w-60"
      />
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Switch
          checked={enabled}
          onCheckedChange={(on) => store.getState().setEnabled(on)}
          aria-label="Enabled"
        />
        {enabled ? "Enabled" : "Disabled"}
      </label>
      <span className="text-[12px]" aria-live="polite">
        {status}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        {diagnostics.count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive-text"
            onClick={focusFirstProblem}
          >
            <CircleAlert />
            {diagnostics.count === 1 ? "1 problem" : `${diagnostics.count} problems`}
          </Button>
        )}
        <IconButton
          label="Undo"
          shortcut="Ctrl/⌘ Z"
          disabled={!canUndo}
          onClick={() => store.getState().undo()}
        >
          <Undo2 />
        </IconButton>
        <IconButton
          label="Redo"
          shortcut="Ctrl/⌘ Shift Z"
          disabled={!canRedo}
          onClick={() => store.getState().redo()}
        >
          <Redo2 />
        </IconButton>
        {isMobile && (
          <IconButton label="Add step" onClick={() => setQuickAdd(true)}>
            <Plus />
          </IconButton>
        )}
        <Button variant="outline" size="sm" onClick={() => openDock("test")}>
          <FlaskConical /> Test
        </Button>
        {workflow && runnable && (
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            Run now
          </Button>
        )}
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {workflow ? "Save" : "Create workflow"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="More workflow actions" />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={tidy}>Tidy up the layout</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHelpOpen(true)}>
              <Keyboard /> Keyboard shortcuts
            </DropdownMenuItem>
            {workflow && (
              <DropdownMenuItem onClick={() => setRevisionsOpen(true)}>
                <History /> Revisions
              </DropdownMenuItem>
            )}
            {workflow && (
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete workflow
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {!isMobile && (
          <IconButton
            label={inspectorOpen ? "Hide the inspector" : "Show the inspector"}
            onClick={() => togglePanel(inspectorRef)}
          >
            {inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </IconButton>
        )}
      </div>
    </div>
  );

  const dock = (
    <Tabs
      value={dockTab}
      onValueChange={(tab: DockTab) => openDock(tab)}
      className="flex h-full min-h-0 flex-col gap-0 bg-panel"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-border border-b px-2">
        <TabsList variant="line" className="h-full">
          <TabsTrigger value="runs" onClick={() => openDock("runs")}>
            Runs
          </TabsTrigger>
          <TabsTrigger value="test" onClick={() => openDock("test")}>
            Test run
          </TabsTrigger>
        </TabsList>
        {overlayState.source && (
          <span className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground">
            Showing {overlayState.source.kind === "test" ? "the test run" : "a run"} on the canvas
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setSelectedRunId(null);
                clear();
              }}
            >
              Clear
            </Button>
          </span>
        )}
        <IconButton
          className={cn(!overlayState.source && "ml-auto")}
          label={dockOpen ? "Collapse" : "Expand"}
          onClick={() => togglePanel(dockRef)}
        >
          {dockOpen ? <ChevronDown /> : <ChevronUp />}
        </IconButton>
      </div>
      <TabsContent value="runs" className={cn("min-h-0 flex-1", !dockOpen && "hidden")}>
        <RunsPanel
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          revision={workflow?.revision ?? null}
          onReplay={(runId) => {
            setReplay({ runId, fromNodeId: null });
            openDock("test");
          }}
        />
      </TabsContent>
      <TabsContent value="test" keepMounted className={cn("min-h-0 flex-1", !dockOpen && "hidden")}>
        <TestPanel replay={replay} onReplayChange={setReplay} />
      </TabsContent>
    </Tabs>
  );

  const center = (
    <ResizablePanelGroup
      id="metis-workflow-editor-rows"
      orientation="vertical"
      groupRef={rows.groupRef}
      onLayoutChanged={rows.onLayoutChanged}
    >
      <ResizablePanel id="canvas" minSize={160}>
        <WorkflowCanvas />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="dock"
        panelRef={dockRef}
        collapsible
        collapsedSize={36}
        defaultSize={36}
        minSize={160}
        maxSize="70%"
        onResize={(size) => setDockOpen(size.inPixels > 40)}
      >
        {dock}
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  return (
    <EditorEnvContext value={env}>
      <DiagnosticsContext value={diagnostics}>
        <OverlayContext value={overlay}>
          <CanvasElementContext value={canvasRef}>
            <div className="flex h-full min-h-0 flex-col">
              {topBar}
              <div className="min-h-0 flex-1">
                {isMobile ? (
                  center
                ) : (
                  <ResizablePanelGroup
                    id="metis-workflow-editor-columns"
                    groupRef={columns.groupRef}
                    onLayoutChanged={columns.onLayoutChanged}
                  >
                    <ResizablePanel
                      id="palette"
                      panelRef={paletteRef}
                      collapsible
                      defaultSize={0}
                      minSize={200}
                      maxSize={360}
                      onResize={(size) => setPaletteOpen(size.inPixels > 0)}
                    >
                      <div className="h-full border-border border-r">
                        <StepPalette />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel id="center" minSize={320}>
                      {center}
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel
                      id="inspector"
                      panelRef={inspectorRef}
                      collapsible
                      defaultSize={340}
                      minSize={280}
                      maxSize={520}
                      onResize={(size) => setInspectorOpen(size.inPixels > 0)}
                    >
                      <div className="h-full border-border border-l">
                        <Inspector />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </div>
            </div>

            {isMobile && (
              <Sheet
                open={selectedCount > 0}
                onOpenChange={(open) => {
                  if (!open) store.getState().select([]);
                }}
              >
                <SheetContent side="bottom" className="h-[70vh] p-0">
                  <SheetTitle className="sr-only">Step settings</SheetTitle>
                  <Inspector />
                </SheetContent>
              </Sheet>
            )}

            <QuickAdd open={quickAdd} onOpenChange={setQuickAdd} />
            <Dialog open={inputsOpen} onOpenChange={setInputsOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run {workflow?.name ?? "this workflow"}</DialogTitle>
                  <DialogDescription>Fill in the inputs this run starts with.</DialogDescription>
                </DialogHeader>
                <InputsForm fields={manualFields} value={runInputs} onChange={setRunInputs} />
                <DialogFooter>
                  <Button
                    disabled={running}
                    onClick={() => {
                      setInputsOpen(false);
                      void queueRun(runInputs);
                    }}
                  >
                    {running ? <Loader2 className="animate-spin" /> : <Play />}
                    Run now
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {workflow && (
              <RevisionsSheet
                workflowId={workflow.id}
                current={graph}
                open={revisionsOpen}
                onOpenChange={setRevisionsOpen}
              />
            )}
            <ShortcutsHelp
              open={helpOpen}
              onOpenChange={setHelpOpen}
              prefix={WORKFLOW_CHORD_PREFIX}
              bindings={bindings}
              unchorded={WORKFLOW_UNCHORDED}
            />
            <ChordHint prefix={WORKFLOW_CHORD_PREFIX} bindings={bindings} visible={armed} />

            <AlertDialog
              open={confirmDelete}
              onOpenChange={(open) => {
                if (!open) setConfirmDelete(false);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {workflow
                      ? `"${workflow.name}" stops running. Its queued and waiting runs are cancelled, and its run history stays but can no longer be retried. A run already in progress finishes its current step.`
                      : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={doDelete}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CanvasElementContext>
        </OverlayContext>
      </DiagnosticsContext>
    </EditorEnvContext>
  );
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  const [store] = useState(() =>
    createEditorStore({
      name: props.workflow?.name ?? "",
      enabled: props.workflow?.enabled ?? true,
      graph:
        props.workflow?.graph ??
        templateGraph(props.template, directoryResources(props.directory, browserTimezone())),
    }),
  );
  return (
    <ReactFlowProvider>
      <EditorStoreContext value={store}>
        <LabelOptionsProvider mailboxes={props.directory.mailboxes}>
          <EditorShell {...props} />
        </LabelOptionsProvider>
      </EditorStoreContext>
    </ReactFlowProvider>
  );
}
