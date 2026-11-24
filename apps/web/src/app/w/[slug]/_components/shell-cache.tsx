"use client";

import { useEffect } from "react";

import { startShellCache } from "@/lib/shell-cache";

export function ShellCache({ userId, version }: { userId: string; version: string }) {
  useEffect(() => startShellCache({ userId, version }), [userId, version]);
  return null;
}
