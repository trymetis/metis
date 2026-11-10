import "server-only";
import { config } from "@/config";

export function ownerEmail(): string {
  return config.app.ownerEmail;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ownerEmail();
}
