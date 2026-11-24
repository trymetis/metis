"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileWarning,
  Loader2,
  MoreHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { DriveIcon } from "@/components/drive-icon";
import { IconButton } from "@/components/icon-button";
import { formatBytes } from "@/lib/utils";
import type { DriveEntryRow } from "@/server/schema";

import { DrivePreviewImage } from "./drive-preview-image";
import { DrivePreviewLoading } from "./drive-preview-loading";
import { DrivePreviewMarkdown } from "./drive-preview-markdown";
import { DrivePreviewAudio, DrivePreviewVideo } from "./drive-preview-media";
import { DrivePreviewTable } from "./drive-preview-table";
import { DrivePreviewText } from "./drive-preview-text";
import { DrivePreviewZip } from "./drive-preview-zip";
import type { PdfControls } from "./pdf-controls";
import { type DrivePreviewState, useDrivePreview } from "./use-drive-preview";

const DrivePreviewPdf = dynamic(
  () => import("./drive-preview-pdf").then((mod) => mod.DrivePreviewPdf),
  { ssr: false, loading: () => <DrivePreviewLoading /> },
);

function fallbackMessage(state: DrivePreviewState, failed: boolean): string {
  if (failed) return "This file can't be previewed here.";
  switch (state.status) {
    case "unsupported":
      return "There is no preview for this file type.";
    case "too-large":
      return `This file is over ${formatBytes(state.cap)}, too large to preview.`;
    case "failed":
      return state.message ?? "A preview isn't available for this file.";
    default:
      return "";
  }
}

function PreviewBody({
  entry,
  state,
  onFail,
  onPdfControls,
}: {
  entry: DriveEntryRow;
  state: Extract<DrivePreviewState, { status: "ready" }>;
  onFail: () => void;
  onPdfControls: (controls: PdfControls | null) => void;
}) {
  switch (state.kind) {
    case "image":
      return <DrivePreviewImage url={state.url} name={entry.name} onFail={onFail} />;
    case "video":
      return <DrivePreviewVideo url={state.url} onFail={onFail} />;
    case "audio":
      return <DrivePreviewAudio url={state.url} name={entry.name} onFail={onFail} />;
    case "markdown":
      return <DrivePreviewMarkdown blob={state.blob} onFail={onFail} />;
    case "table":
      return <DrivePreviewTable blob={state.blob} name={entry.name} onFail={onFail} />;
    case "zip":
      return <DrivePreviewZip blob={state.blob} onFail={onFail} />;
    case "pdf":
      return <DrivePreviewPdf blob={state.blob} onFail={onFail} onControls={onPdfControls} />;
    case "text":
      return <DrivePreviewText blob={state.blob} truncated={state.truncated} onFail={onFail} />;
  }
}

export function DrivePreview({
  entry,
  workspaceSlug,
  driveSlug,
  providerLabel,
  onClose,
  onDownload,
  onMissing,
}: {
  entry: DriveEntryRow;
  workspaceSlug: string;
  driveSlug: string;
  providerLabel: string | null;
  onClose: () => void;
  onDownload: (entry: DriveEntryRow) => void;
  onMissing?: () => void;
}) {
  const state = useDrivePreview(entry, workspaceSlug, driveSlug);
  const missing = state.status === "failed" && state.missing === true;
  useEffect(() => {
    if (missing) onMissing?.();
  }, [missing, onMissing]);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const [pdf, setPdf] = useState<PdfControls | null>(null);

  const save = () => {
    if (state.status !== "ready" || state.truncated) {
      onDownload(entry);
      return;
    }
    const link = document.createElement("a");
    link.href = state.url;
    link.download = entry.name;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const webUrl = entry.webUrl;
  const openAtProvider = webUrl ? () => window.open(webUrl, "_blank") : null;
  const openLabel = providerLabel ? `Open in ${providerLabel}` : "Open";

  const fallbackActions = (
    <>
      <Button variant="outline" size="sm" onClick={save}>
        <Download className="mr-1.5 size-3.5" />
        Download
      </Button>
      {openAtProvider && (
        <Button variant="outline" size="sm" onClick={openAtProvider}>
          <ExternalLink className="mr-1.5 size-3.5" />
          {openLabel}
        </Button>
      )}
    </>
  );

  const meta = [
    entry.size === null ? null : formatBytes(entry.size),
    entry.modifiedAt
      ? new Date(entry.modifiedAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null,
  ].filter(Boolean);

  return (
    <aside
      aria-label={`Preview of ${entry.name}`}
      className="@container/preview flex w-[min(52rem,50%)] min-w-80 shrink-0 flex-col border-l border-border bg-background max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:min-w-0 max-md:border-l-0"
    >
      <div className="flex items-center gap-1 border-b border-border py-1.5 pr-2 pl-4">
        <DriveIcon name={entry.name} kind={entry.kind} className="size-5 shrink-0" />
        <p
          className="ml-2 min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
          title={[entry.name, meta.join(" · ")].filter(Boolean).join("\n")}
        >
          {entry.name}
        </p>
        {pdf && (
          <div className="flex shrink-0 items-center">
            <IconButton label="Previous page" disabled={!pdf.canPrev} onClick={pdf.prev}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="min-w-12 text-center text-[11px] text-muted-foreground tabular-nums">
              {pdf.ready ? `${pdf.page} / ${pdf.pageCount}` : "…"}
            </span>
            <IconButton label="Next page" disabled={!pdf.canNext} onClick={pdf.next}>
              <ChevronRight className="size-4" />
            </IconButton>
            {pdf.rendering && <Loader2 className="size-3.5 animate-spin text-faint" />}
            <div className="hidden items-center @min-[30rem]/preview:flex">
              <IconButton label="Zoom out" disabled={!pdf.canZoomOut} onClick={pdf.zoomOut}>
                <ZoomOut className="size-4" />
              </IconButton>
              <Button
                variant="ghost"
                size="sm"
                title="Fit to width"
                disabled={!pdf.ready}
                onClick={pdf.fit}
                className="min-w-12 px-1 text-[11px] tabular-nums"
              >
                {pdf.zoomLabel}
              </Button>
              <IconButton label="Zoom in" disabled={!pdf.canZoomIn} onClick={pdf.zoomIn}>
                <ZoomIn className="size-4" />
              </IconButton>
            </div>
          </div>
        )}
        <IconButton label="Download" onClick={save}>
          <Download className="size-4" />
        </IconButton>
        {openAtProvider && (
          <IconButton
            label={openLabel}
            onClick={openAtProvider}
            className="hidden @min-[30rem]/preview:inline-flex"
          >
            <ExternalLink className="size-4" />
          </IconButton>
        )}
        {(pdf || openAtProvider) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More preview actions"
                  title="More preview actions"
                  className="@min-[30rem]/preview:hidden"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              {pdf && (
                <>
                  <DropdownMenuItem disabled={!pdf.canZoomIn} onClick={pdf.zoomIn}>
                    <ZoomIn className="size-3.5" />
                    Zoom in
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!pdf.canZoomOut} onClick={pdf.zoomOut}>
                    <ZoomOut className="size-3.5" />
                    Zoom out
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!pdf.ready} onClick={pdf.fit}>
                    Fit to width
                  </DropdownMenuItem>
                </>
              )}
              {pdf && openAtProvider && <DropdownMenuSeparator />}
              {openAtProvider && (
                <DropdownMenuItem onClick={openAtProvider}>
                  <ExternalLink className="size-3.5" />
                  {openLabel}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <IconButton label="Close preview" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      {state.status === "ready" && state.truncated && !failed && (
        <div className="border-b border-border bg-panel px-4 py-1.5 text-[11px] text-muted-foreground">
          Truncated: only the first {formatBytes(state.blob.size)} is shown. Download the file to
          see all of it.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {state.status === "loading" ? (
          <DrivePreviewLoading loaded={state.loaded} total={state.total} />
        ) : state.status === "ready" && !failed ? (
          <PreviewBody entry={entry} state={state} onFail={fail} onPdfControls={setPdf} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <FileWarning className="size-8 text-faint" />
            <p className="max-w-sm text-[13px] text-muted-foreground">
              {fallbackMessage(state, failed)}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {fallbackActions}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
