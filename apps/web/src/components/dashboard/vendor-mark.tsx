import { cn } from "@metis/ui/lib/utils";

import { type BrandMark, ResendMail } from "@/components/brand-marks";
import { AnthropicBlack } from "@/components/ui/svgs/anthropicBlack";
import { AnthropicWhite } from "@/components/ui/svgs/anthropicWhite";
import { AwsDark } from "@/components/ui/svgs/awsDark";
import { AwsLight } from "@/components/ui/svgs/awsLight";
import { Cloudflare } from "@/components/ui/svgs/cloudflare";
import { OllamaDark } from "@/components/ui/svgs/ollamaDark";
import { OllamaLight } from "@/components/ui/svgs/ollamaLight";
import { Openai } from "@/components/ui/svgs/openai";
import { OpenaiDark } from "@/components/ui/svgs/openaiDark";
import { OpenrouterDark } from "@/components/ui/svgs/openrouterDark";
import { OpenrouterLight } from "@/components/ui/svgs/openrouterLight";
import { Redis } from "@/components/ui/svgs/redis";
import { Sqlite } from "@/components/ui/svgs/sqlite";
import { TursoDark } from "@/components/ui/svgs/tursoDark";
import { TursoLight } from "@/components/ui/svgs/tursoLight";
import { Upstash } from "@/components/ui/svgs/upstash";
import type { SystemVendor } from "@/server/schema";

function themed(Light: BrandMark, Dark: BrandMark): BrandMark {
  return ({ className }) => (
    <>
      <Light className={cn(className, "dark:hidden")} />
      <Dark className={cn(className, "hidden dark:block")} />
    </>
  );
}

const VENDORS: Record<SystemVendor, { label: string; Mark: BrandMark }> = {
  openai: { label: "OpenAI", Mark: themed(Openai, OpenaiDark) },
  anthropic: {
    label: "Anthropic",
    Mark: themed(AnthropicBlack, AnthropicWhite),
  },
  openrouter: {
    label: "OpenRouter",
    Mark: themed(OpenrouterLight, OpenrouterDark),
  },
  ollama: { label: "Ollama", Mark: themed(OllamaLight, OllamaDark) },
  redis: { label: "Redis", Mark: Redis },
  upstash: { label: "Upstash", Mark: Upstash },
  turso: { label: "libSQL / Turso", Mark: themed(TursoLight, TursoDark) },
  sqlite: { label: "SQLite", Mark: Sqlite },
  resend: { label: "Resend", Mark: ResendMail },
  aws: { label: "Amazon S3", Mark: themed(AwsLight, AwsDark) },
  cloudflare: { label: "Cloudflare R2", Mark: Cloudflare },
};

export function vendorLabel(vendor: SystemVendor): string {
  return VENDORS[vendor].label;
}

export function VendorMark({ vendor, className }: { vendor: SystemVendor; className?: string }) {
  const { Mark } = VENDORS[vendor];
  return <Mark className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

export function WithVendor({
  vendor,
  children,
}: {
  vendor: SystemVendor | null;
  children: React.ReactNode;
}) {
  if (!vendor) return children;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <VendorMark vendor={vendor} />
      {children}
    </span>
  );
}
