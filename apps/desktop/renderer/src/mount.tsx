import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { MetisBridge } from "../../src/settings-types";

declare global {
  interface Window {
    metis: MetisBridge;
  }
}

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  document.documentElement.classList.toggle("dark", themeQuery.matches);
}

export function mount(page: ReactNode) {
  applyTheme();
  themeQuery.addEventListener("change", applyTheme);
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}

export function queryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}
