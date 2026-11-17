import { SourceFooterLayout } from "@/components/source-footer-layout";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <SourceFooterLayout className="bg-background text-foreground">{children}</SourceFooterLayout>
  );
}
