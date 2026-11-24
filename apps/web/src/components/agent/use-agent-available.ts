"use client";

import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";

export function useAgentAvailable(): boolean {
  const platformAi = usePlatformPolicy().ai;
  const scopeAi = useScopePolicy().ai;
  return platformAi && scopeAi;
}
