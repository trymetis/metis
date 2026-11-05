import { SourceFooterLayout } from "@/components/source-footer-layout";

export default function StandaloneLayout({ children }: LayoutProps<"/">) {
  return <SourceFooterLayout>{children}</SourceFooterLayout>;
}
