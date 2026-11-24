export interface PdfControls {
  ready: boolean;
  page: number;
  pageCount: number;
  rendering: boolean;
  zoomLabel: string;
  canPrev: boolean;
  canNext: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  prev: () => void;
  next: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}
