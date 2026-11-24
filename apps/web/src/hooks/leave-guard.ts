import type { Route } from "next";

type LeaveGuard = (href: Route) => void;

let current: LeaveGuard | null = null;

export function setLeaveGuard(guard: LeaveGuard | null): void {
  current = guard;
}

export function guardedLeave(href: Route): boolean {
  if (!current) return false;
  current(href);
  return true;
}
