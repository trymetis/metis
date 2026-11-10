import { Badge } from "@metis/ui/components/badge";

import { USER_ROLE_LABELS, type UserRole } from "@/types/instance-role";

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === "user") return <span className="text-faint">{USER_ROLE_LABELS.user}</span>;
  return (
    <Badge variant={role === "owner" ? "default" : "secondary"}>{USER_ROLE_LABELS[role]}</Badge>
  );
}
