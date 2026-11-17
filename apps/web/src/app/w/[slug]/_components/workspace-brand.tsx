"use client";

import { useEffect } from "react";

import { type ActiveTheme, themeStyleHref } from "@/theme/active";

export function WorkspaceBrand({ theme }: { theme: ActiveTheme }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-brand", theme.id);
    return () => root.removeAttribute("data-brand");
  }, [theme.id]);

  return (
    <style href={themeStyleHref(theme)} precedence="metis-theme">
      {theme.css}
    </style>
  );
}
