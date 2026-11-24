"use client";

import { useTheme } from "next-themes";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
  TextLayer,
} from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

import { DrivePreviewLoading } from "./drive-preview-loading";
import type { PdfControls } from "./pdf-controls";

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;
const FRAME_PADDING = 48;

GlobalWorkerOptions.workerPort ??= new Worker(new URL("./drive-pdf-worker.ts", import.meta.url), {
  type: "module",
});

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function tokenColor(name: string): string | null {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  const context = document.createElement("canvas").getContext("2d");
  if (!value || !context) return null;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function darkPageColors(): { background: string; foreground: string } | null {
  const background = tokenColor("--background");
  const foreground = tokenColor("--foreground");
  return background && foreground ? { background, foreground } : null;
}

export function DrivePreviewPdf({
  blob,
  onFail,
  onControls,
}: {
  blob: Blob;
  onFail: () => void;
  onControls: (controls: PdfControls | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [frameWidth, setFrameWidth] = useState(0);
  const [rendered, setRendered] = useState<{ doc: PDFDocumentProxy; key: string } | null>(null);
  const [shownBlob, setShownBlob] = useState(blob);
  const frame = useRef<HTMLDivElement>(null);
  const pageElement = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);

  if (blob !== shownBlob) {
    setShownBlob(blob);
    setDoc(null);
    setPageNumber(1);
    setZoom(null);
  }

  const renderKey = `${pageNumber} ${zoom} ${frameWidth} ${dark}`;
  const rendering =
    doc !== null && frameWidth !== 0 && (rendered?.doc !== doc || rendered.key !== renderKey);

  useEffect(() => {
    let active = true;
    let destroy: (() => void) | null = null;
    (async () => {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (!active) return;
      const task = getDocument({ data, enableXfa: false });
      destroy = () => void task.destroy();
      const loaded = await task.promise;
      if (active) setDoc(loaded);
    })().catch(() => active && onFail());
    return () => {
      active = false;
      destroy?.();
    };
  }, [blob, onFail]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFrameWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || frameWidth === 0) return;
    let active = true;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (!active) return;
      const base = page.getViewport({ scale: 1 });
      const fit = clampScale((frameWidth - FRAME_PADDING) / base.width);
      setFitScale(fit);
      const scale = zoom ?? fit;
      const viewport = page.getViewport({ scale });
      const host = canvasHost.current;
      const text = textHost.current;
      const pageBox = pageElement.current;
      if (!host || !text || !pageBox) return;

      const ratio = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.className = "block size-full";
      pageBox.style.width = `${Math.floor(viewport.width)}px`;
      pageBox.style.height = `${Math.floor(viewport.height)}px`;
      pageBox.style.setProperty("--total-scale-factor", String(scale));
      host.replaceChildren(canvas);
      text.replaceChildren();

      const pageColors = dark ? darkPageColors() : null;
      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        ...(pageColors ? { pageColors } : {}),
      });
      await renderTask.promise;
      if (!active) return;
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport,
      });
      await textLayer.render();
    })()
      .catch(() => active && onFail())
      .finally(() => active && setRendered({ doc, key: renderKey }));
    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, pageNumber, zoom, frameWidth, dark, onFail, renderKey]);

  const pageCount = doc?.numPages ?? 0;
  const scale = zoom ?? fitScale;
  const ready = doc !== null;
  const fitted = zoom === null;

  useEffect(() => {
    onControls({
      ready,
      page: pageNumber,
      pageCount,
      rendering,
      zoomLabel: fitted ? "Fit" : `${Math.round(scale * 100)}%`,
      canPrev: ready && pageNumber > 1,
      canNext: ready && pageNumber < pageCount,
      canZoomIn: ready && scale < MAX_SCALE,
      canZoomOut: ready && scale > MIN_SCALE,
      prev: () => setPageNumber((n) => Math.max(1, n - 1)),
      next: () => setPageNumber((n) => Math.min(pageCount, n + 1)),
      zoomIn: () => setZoom(clampScale(scale * ZOOM_STEP)),
      zoomOut: () => setZoom(clampScale(scale / ZOOM_STEP)),
      fit: () => setZoom(null),
    });
  }, [onControls, ready, pageNumber, pageCount, rendering, fitted, scale]);

  useEffect(() => () => onControls(null), [onControls]);

  return (
    <div className="flex h-full flex-col">
      <div ref={frame} className="min-h-0 flex-1 overflow-auto bg-panel [scrollbar-gutter:stable]">
        {!doc && <DrivePreviewLoading />}
        <div className={doc ? "flex min-w-fit justify-center p-6" : "hidden"}>
          <div ref={pageElement} className="pdf-page relative shrink-0 bg-background shadow-sm">
            <div ref={canvasHost} className="absolute inset-0" />
            <div ref={textHost} className="textLayer" />
          </div>
        </div>
      </div>
    </div>
  );
}
