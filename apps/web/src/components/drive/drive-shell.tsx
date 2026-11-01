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
import { Progress } from "@metis/ui/components/progress";
import { skipToken, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AgentDisabled } from "@/components/agent/agent-disabled";
import { ChordHint } from "@/components/chord-hint";
import { DrivePickerDialog } from "@/components/drive-picker-dialog";
import { DrivePreview } from "@/components/drive-preview/drive-preview";
import { downloadDriveFile } from "@/components/drive-preview/use-drive-preview";
import { ResponsiveAside } from "@/components/mobile-aside";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import { useScopePolicy } from "@/components/scope-policy-context";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { driveName } from "@/drive/name";
import { listenDriveActions, listenDrivePreviews, takeDrivePreview } from "@/drive/pending-open";
import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { DriveEntryRow, DrivePin, DriveQuotaRow, WorkspaceDrive } from "@/server/schema";
import { ALL_DRIVES_SLUG, drivePath } from "@/workspace/path";

import { DriveAgentPanel } from "./drive-agent-panel";
import { DriveEntries, type DriveView } from "./drive-entries";
import { DriveNameDialog } from "./drive-name-dialog";
import { DriveSidebar } from "./drive-sidebar";
import { type Crumb, DriveToolbar } from "./drive-toolbar";
import { useDriveRecents } from "./use-drive-recents";
import { DRIVE_CHORD_PREFIX, DRIVE_UNCHORDED, useDriveShortcuts } from "./use-drive-shortcuts";
import { useDriveUpload } from "./use-drive-upload";

const VIEW_KEY = "metis:drive-view";
const NO_PINS: DrivePin[] = [];

export function DriveShell({ trail }: { trail: string[] }) {
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const { driveSlug } = useWorkspacePath();
  const scope = useMemo(
    () => ({ workspaceSlug, driveSlug: driveSlug ?? "" }),
    [workspaceSlug, driveSlug],
  );

  const drivesQuery = useQuery(rpc.workspaceDrives.list.queryOptions({ input: { workspaceSlug } }));
  const drives: WorkspaceDrive[] | null =
    drivesQuery.data?.drives ?? (drivesQuery.isError ? [] : null);
  const pinsQuery = useQuery(
    rpc.drive.pins.queryOptions({ input: scope.driveSlug ? scope : skipToken }),
  );
  const pins: DrivePin[] = pinsQuery.data?.pins ?? NO_PINS;
  const quotasQuery = useQuery(
    rpc.drive.quotas.queryOptions({
      input: scope.driveSlug && scope.driveSlug !== ALL_DRIVES_SLUG ? scope : skipToken,
    }),
  );
  const quota: DriveQuotaRow | null =
    quotasQuery.data?.quotas.find((q) => q.driveSlug === scope.driveSlug) ?? null;
  const storedView = useStoredItem(VIEW_KEY);
  const view: DriveView = storedView === "grid" ? "grid" : "list";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DriveEntryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriveEntryRow | null>(null);
  const [dragging, setDragging] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<DriveEntryRow | null>(null);
  const platformAi = usePlatformPolicy().ai;
  const policy = useScopePolicy();

  const fileInput = useRef<HTMLInputElement>(null);
  const { recents, remember } = useDriveRecents(workspaceSlug, scope.driveSlug);
  const { upload, progress } = useDriveUpload();

  const parentId = trail.at(-1) ?? null;
  const pageOptions = {
    initialPageParam: undefined,
    getNextPageParam: (last: { cursor: string | null }) => last.cursor ?? undefined,
  };
  const listQuery = useInfiniteQuery(
    rpc.drive.list.infiniteOptions({
      ...pageOptions,
      input: (cursor: string | undefined) => ({ ...scope, parentId, cursor }),
      enabled: Boolean(scope.driveSlug) && !search,
    }),
  );
  const searchQuery = useInfiniteQuery(
    rpc.drive.search.infiniteOptions({
      ...pageOptions,
      input: (cursor: string | undefined) => ({ ...scope, query: search, cursor }),
      enabled: Boolean(scope.driveSlug) && Boolean(search),
    }),
  );
  const pages = search ? searchQuery : listQuery;
  const pagesData = pages.data;
  const entries: DriveEntryRow[] = useMemo(
    () => pagesData?.pages.flatMap((page) => page.entries) ?? [],
    [pagesData],
  );
  const cursor = pages.hasNextPage;
  const loading = pages.isPending && !pages.isError;
  const loadingMore = pages.isFetchingNextPage;
  const error =
    pages.error && !pages.data ? pages.error.message || "Could not load this drive" : null;
  const isAll = scope.driveSlug === ALL_DRIVES_SLUG;
  const needsTarget = isAll && parentId === null;
  const activeDrive = drives?.find((d) => d.slug === scope.driveSlug) ?? null;
  const previewDrive = previewEntry
    ? drives?.find((d) => d.driveId === previewEntry.driveId)
    : null;
  const hasTrash = (entry: DriveEntryRow) => {
    const provider = drives?.find((d) => d.driveId === entry.driveId)?.provider;
    return provider === "google" || provider === "microsoft";
  };
  const [pendingTarget, setPendingTarget] = useState<
    { kind: "upload"; files: File[] } | { kind: "folder" } | null
  >(null);
  const [folderParent, setFolderParent] = useState<string | null>(null);

  useEffect(() => {
    if (!scope.driveSlug) return;
    const show = (entry: DriveEntryRow) => {
      setSelectedId(entry.id);
      setPreviewEntry(entry);
    };
    const pending = takeDrivePreview(scope.driveSlug);
    if (pending) show(pending);
    return listenDrivePreviews(scope.driveSlug, show);
  }, [scope.driveSlug]);

  const changeView = useCallback((next: DriveView) => {
    writeStoredItem(VIEW_KEY, next);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const refreshPins = useCallback(() => {
    void refreshQueries(rpc.drive.pins.key());
  }, []);

  const load = useCallback(async () => {
    await Promise.all([
      refreshQueries(rpc.drive.list.key()),
      refreshQueries(rpc.drive.search.key()),
    ]);
  }, []);

  const unnamed = trail.filter((id) => !names[id]);
  const fetchedNames = useQueries({
    queries: unnamed.map((id) => rpc.drive.get.queryOptions({ input: { ...scope, fileId: id } })),
    combine: (results) =>
      Object.fromEntries(
        results.flatMap((result, index) => {
          const name = result.data?.name ?? (result.isError ? "Folder" : undefined);
          return name === undefined ? [] : [[unnamed[index], name]];
        }),
      ),
  });

  const listedDrives = drivesQuery.data?.drives;
  const crumbs: Crumb[] = useMemo(
    () => [
      {
        id: null,
        name: isAll
          ? "All drives"
          : activeDrive
            ? driveName(activeDrive, listedDrives ?? [])
            : "Drive",
      },
      ...trail.map((id) => ({ id, name: names[id] ?? fetchedNames[id] ?? "…" })),
    ],
    [trail, names, fetchedNames, isAll, activeDrive, listedDrives],
  );

  const openFolder = useCallback(
    (id: string, name: string) => {
      setNames((current) => ({ ...current, [id]: name }));
      remember({ id, name });
      setQuery("");
      router.push(drivePath(workspaceSlug, scope.driveSlug, [...trail, id]));
    },
    [router, workspaceSlug, scope.driveSlug, trail, remember],
  );

  const openEntry = useCallback(
    (entry: DriveEntryRow) => {
      if (entry.kind === "folder") {
        openFolder(entry.id, entry.name);
        return;
      }
      setSelectedId(entry.id);
      setPreviewEntry(entry);
    },
    [openFolder],
  );

  const previewSelected = useCallback(() => {
    const entry = entries.find((e) => e.id === selectedId);
    if (entry && entry.kind === "file") openEntry(entry);
  }, [entries, selectedId, openEntry]);

  const download = useCallback(
    (entry: DriveEntryRow) => downloadDriveFile(workspaceSlug, scope.driveSlug, entry.id),
    [workspaceSlug, scope.driveSlug],
  );

  const { fetchNextPage } = pages;
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const result = await fetchNextPage();
    if (result.isError) toast.error("Could not load more files");
  }, [cursor, loadingMore, fetchNextPage]);

  const openNewFolder = useCallback(() => {
    if (needsTarget) {
      setPendingTarget({ kind: "folder" });
      return;
    }
    setFolderParent(parentId);
    setNewFolderOpen(true);
  }, [needsTarget, parentId]);
  const pickUpload = useCallback(() => fileInput.current?.click(), []);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);
  const goRoot = useCallback(() => {
    setQuery("");
    router.push(drivePath(workspaceSlug, scope.driveSlug));
  }, [router, workspaceSlug, scope.driveSlug]);
  const goAllDrives = useCallback(() => {
    setQuery("");
    router.push(drivePath(workspaceSlug, ALL_DRIVES_SLUG));
  }, [router, workspaceSlug]);

  const { armed, bindings, helpOpen, setHelpOpen } = useDriveShortcuts({
    onNewFolder: openNewFolder,
    onUpload: pickUpload,
    onViewChange: changeView,
    onRoot: goRoot,
    onAllDrives: goAllDrives,
    onToggleAgent: toggleAgent,
    onPreview: previewSelected,
  });

  const uploadTo = useCallback(
    async (files: File[], target: string | null) => {
      try {
        await upload({ scope, parentId: target, files });
        toast.success(
          files.length === 1 ? `Uploaded ${files[0]?.name}` : `Uploaded ${files.length} files`,
        );
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [upload, scope, load],
  );

  const runUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (needsTarget) {
        setPendingTarget({ kind: "upload", files });
        return;
      }
      void uploadTo(files, parentId);
    },
    [needsTarget, parentId, uploadTo],
  );

  useEffect(() => {
    if (!scope.driveSlug) return;
    return listenDriveActions((action) => {
      if (action.kind === "upload") runUpload(action.files);
      else openNewFolder();
    });
  }, [scope.driveSlug, runUpload, openNewFolder]);

  return (
    <div className="flex h-full min-h-0">
      <ResponsiveAside label="Drives">
        <DriveSidebar
          drives={drives}
          showPinDrive={isAll}
          pins={pins}
          recents={recents}
          quota={quota}
          onOpenFolder={(id, name) => {
            setNames((current) => ({ ...current, [id]: name }));
            setQuery("");
            router.push(drivePath(workspaceSlug, scope.driveSlug, [id]));
          }}
          onUnpin={(pinId) => {
            orpc.drive
              .unpin({ ...scope, pinId })
              .then(refreshPins)
              .catch(() => toast.error("Could not remove that pin"));
          }}
        />
      </ResponsiveAside>

      <div className="flex min-w-0 flex-1 flex-col">
        <DriveToolbar
          crumbs={crumbs}
          query={query}
          view={view}
          onNavigate={(index) => {
            setQuery("");
            router.push(drivePath(workspaceSlug, scope.driveSlug, trail.slice(0, index)));
          }}
          onQueryChange={setQuery}
          onViewChange={changeView}
          onNewFolder={openNewFolder}
          onUpload={pickUpload}
          showAgentToggle={platformAi}
          agentOpen={agentOpen}
          onToggleAgent={toggleAgent}
        />

        {progress && (
          <div className="border-b border-border px-4 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">Uploading {progress.name}</span>
              <span>
                {progress.total > 0
                  ? `${Math.round((progress.loaded / progress.total) * 100)}%`
                  : ""}
              </span>
            </div>
            <Progress
              value={progress.total > 0 ? (progress.loaded / progress.total) * 100 : 100}
              className="gap-0"
            />
          </div>
        )}

        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag-and-drop upload is pointer-only; the upload action is the keyboard path */}
        <section
          aria-label="Files"
          className="relative min-h-0 flex-1 overflow-y-auto"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            runUpload(Array.from(e.dataTransfer.files));
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand-soft/60">
              <span className="flex items-center gap-2 text-[13px] text-foreground">
                <UploadCloud className="h-4 w-4" />
                Drop to upload here
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-[13px] text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-faint">
              {search ? "Nothing matched that search" : "This folder is empty"}
            </div>
          ) : (
            <>
              <DriveEntries
                entries={entries}
                view={view}
                selectedId={selectedId}
                onSelectedChange={setSelectedId}
                actions={{
                  onOpen: openEntry,
                  onDownload: download,
                  onRename: setRenameTarget,
                  onDelete: setDeleteTarget,
                  onPin: (entry) => {
                    orpc.drive
                      .pin({
                        ...scope,
                        driveId: entry.driveId,
                        folderId: entry.id,
                        label: entry.name,
                      })
                      .then(refreshPins)
                      .catch(() => toast.error("Could not pin that folder"));
                  },
                }}
              />
              {cursor && (
                <div className="flex justify-center p-4">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {previewEntry && (
        <DrivePreview
          key={`${previewEntry.driveId}:${previewEntry.id}`}
          entry={previewEntry}
          workspaceSlug={workspaceSlug}
          driveSlug={scope.driveSlug}
          providerLabel={
            previewDrive ? RESOURCE_PROVIDER_META.drive[previewDrive.provider].label : null
          }
          onClose={() => setPreviewEntry(null)}
          onDownload={download}
        />
      )}

      {agentOpen && (
        <div className="w-95 shrink-0 max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:bg-background">
          {policy.ai ? (
            drives && (
              <DriveAgentPanel
                driveSlug={scope.driveSlug}
                folderId={parentId}
                folderPath={crumbs.map((crumb) => crumb.name)}
                entries={entries}
                onClose={() => setAgentOpen(false)}
                onRefresh={load}
                onOpenEntry={openEntry}
              />
            )
          ) : (
            <AgentDisabled
              onClose={() => setAgentOpen(false)}
              reason={policy.workspaceAi ? "resource" : "workspace"}
              resource="drive"
              scopeLabel="this drive"
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>
      )}

      <ShortcutsHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        prefix={DRIVE_CHORD_PREFIX}
        bindings={bindings}
        unchorded={DRIVE_UNCHORDED}
      />
      <ChordHint prefix={DRIVE_CHORD_PREFIX} bindings={bindings} visible={armed} />

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          runUpload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <DrivePickerDialog
        open={pendingTarget !== null}
        onOpenChange={(next) => !next && setPendingTarget(null)}
        title={pendingTarget?.kind === "folder" ? "New folder" : "Upload"}
        description={
          pendingTarget?.kind === "upload"
            ? `Choose the folder to upload ${
                pendingTarget.files.length === 1
                  ? (pendingTarget.files[0]?.name ?? "this file")
                  : `${pendingTarget.files.length} files`
              } into.`
            : "Choose the folder to create it in."
        }
        confirmLabel={pendingTarget?.kind === "folder" ? "Create here" : "Upload here"}
        mode="folder"
        onPick={(pick) => {
          const target = pendingTarget;
          setPendingTarget(null);
          if (target?.kind === "upload") {
            void uploadTo(target.files, pick.folderId);
            return;
          }
          setFolderParent(pick.folderId);
          setNewFolderOpen(true);
        }}
      />

      <DriveNameDialog
        open={newFolderOpen}
        title="New folder"
        description="Create a folder in the current location."
        initialValue=""
        confirmLabel="Create"
        onCancel={() => setNewFolderOpen(false)}
        onConfirm={(name) => {
          orpc.drive
            .createFolder({ ...scope, parentId: folderParent, name })
            .then(() => {
              setNewFolderOpen(false);
              return load();
            })
            .catch(() => toast.error("Could not create that folder"));
        }}
      />

      <DriveNameDialog
        open={renameTarget !== null}
        title="Rename"
        description="Give this item a new name."
        initialValue={renameTarget?.name ?? ""}
        confirmLabel="Rename"
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          if (!renameTarget) return;
          orpc.drive
            .rename({ ...scope, fileId: renameTarget.id, name })
            .then(() => {
              setRenameTarget(null);
              return load();
            })
            .catch(() => toast.error("Could not rename that item"));
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && hasTrash(deleteTarget)
                ? "It moves to the trash of the connected account, where it can still be restored."
                : "It is deleted permanently. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                orpc.drive
                  .delete({ ...scope, fileId: deleteTarget.id })
                  .then(() => {
                    if (previewEntry?.id === deleteTarget.id) {
                      setPreviewEntry(null);
                    }
                    setDeleteTarget(null);
                    return load();
                  })
                  .catch(() => toast.error("Could not delete that item"));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
