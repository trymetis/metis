import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { WorkspaceAddressBooksInner } from "./_components/workspace-address-books-inner";

export default function WorkspaceContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin opacity-50" />
        </div>
      }
    >
      <WorkspaceAddressBooksInner />
    </Suspense>
  );
}
