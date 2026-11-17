"use client";

import type { SourceInfo } from "@/source-info";

import { MobileAsideTrigger } from "./mobile-aside";
import { SourceLink } from "./source-link";

export function MobileSectionBar({ title, source }: { title: string; source?: SourceInfo }) {
  return (
    <div className="sticky top-0 z-10 -mt-2 mb-2 flex items-center gap-2 bg-background py-2 md:hidden">
      <MobileAsideTrigger className="-ml-2 size-8 shrink-0" />
      <span className="text-[18px] font-medium tracking-tight text-foreground">{title}</span>
      {source && <SourceLink source={source} className="ml-auto" />}
    </div>
  );
}
