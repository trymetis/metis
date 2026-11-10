"use client";

import { createContext, use } from "react";

import type { WorkspaceRole } from "@/types/workspace";

export interface WorkspaceAccess {
  workspaceAi: boolean;
  role: WorkspaceRole;
  userId: string;
  hasDashboard: boolean;
}

const WorkspaceAccessContext = createContext<WorkspaceAccess>({
  workspaceAi: false,
  role: "member",
  userId: "",
  hasDashboard: false,
});

export function WorkspaceAccessProvider({
  access,
  children,
}: {
  access: WorkspaceAccess;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceAccessContext.Provider value={access}>{children}</WorkspaceAccessContext.Provider>
  );
}

export function useWorkspaceAccess(): WorkspaceAccess {
  return use(WorkspaceAccessContext);
}
