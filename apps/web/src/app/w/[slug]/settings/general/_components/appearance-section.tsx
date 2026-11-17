"use client";

import { Button } from "@metis/ui/components/button";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { getInitials } from "@/lib/utils";

import { ThemeSection } from "./theme-section";

const MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024;

interface AppearanceSectionProps {
  workspaceName: string;
  initialLogo: string | null;
  canEdit: boolean;
}

export function AppearanceSection({ workspaceName, initialLogo, canEdit }: AppearanceSectionProps) {
  const router = useRouter();
  const scope = useWorkspaceScope();
  const [logo, setLogo] = useState<string | null>(initialLogo);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file");
      return;
    }
    if (file.size > MAX_LOGO_UPLOAD_BYTES) {
      setError("Image must be 5 MB or smaller");
      return;
    }
    setLogoBusy(true);
    setError(null);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const result = reader.result;
          if (typeof result !== "string") {
            reject(new Error("Could not read the image"));
            return;
          }
          const idx = result.indexOf(",");
          resolve(idx === -1 ? result : result.slice(idx + 1));
        });
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(file);
      });
      const res = await orpc.workspaces.setLogo({ ...scope, imageBase64 });
      setLogo(res.logo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload logo");
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    setError(null);
    try {
      await orpc.workspaces.setLogo({ ...scope, imageBase64: null });
      setLogo(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">Appearance</h2>
      <p className="mt-1 text-[12px] text-faint">
        Logo and theme used by everyone in “{workspaceName}”.
        {!canEdit && " Only owners and admins can change them."}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-primary text-[15px] font-medium tracking-wide text-primary-foreground">
          {logo ? (
            // oxlint-disable-next-line nextjs/no-img-element --tiny data-URL logo
            <img src={logo} alt="" className="h-full w-full object-cover" />
          ) : (
            getInitials(workspaceName).slice(0, 2)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground">Workspace logo</div>
          <p className="mt-0.5 text-[12px] text-faint">
            Shown in the navigation rail instead of initials. Resized to 72×72 on upload.
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={logoBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {logoBusy ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <ImagePlus data-icon="inline-start" />
              )}
              {logo ? "Replace" : "Upload"}
            </Button>
            {logo && (
              <Button
                size="sm"
                variant="ghost"
                disabled={logoBusy}
                onClick={removeLogo}
                aria-label="Remove logo"
              >
                <X data-icon="inline-start" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>

      <ThemeSection />
    </section>
  );
}
