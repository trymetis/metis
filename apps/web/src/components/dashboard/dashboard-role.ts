"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";
import { type InstanceRole, meetsRequirement } from "@/types/instance-role";

export function useDashboardRole(): { role: InstanceRole | null; canOperate: boolean } {
  const role = useQuery(rpc.dashboard.me.queryOptions()).data?.role ?? null;
  return { role, canOperate: role !== null && meetsRequirement(role, "operate") };
}
