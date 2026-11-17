import { Toaster } from "@metis/ui/components/sonner";
import { cn } from "@metis/ui/lib/utils";

import "@/lib/orpc.server";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Mono, DM_Sans } from "next/font/google";
import { headers } from "next/headers";

import "@/styles/globals.css";
import { PlatformPolicyProvider } from "@/components/platform-policy-context";
import { themeStyleHref } from "@/theme/active";
import { resolveActiveTheme } from "@/theme/resolve";
import { platformPolicy } from "@/workspace/policy";

import { QueryProvider } from "./_components/query-provider";
import { ThemeProvider } from "./_components/theme-provider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { template: "%s • Metis Suite", default: "Metis Suite" },
  description: "Smart mail client with AI assistant",
};

const IOS_USER_AGENT = /\b(iPhone|iPad|iPod)\b/;

export async function generateViewport(): Promise<Viewport> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  return {
    width: "device-width",
    initialScale: 1,
    interactiveWidget: "resizes-content",
    ...(IOS_USER_AGENT.test(userAgent) && { maximumScale: 1 }),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await resolveActiveTheme();

  return (
    <html
      lang="en"
      data-brand={theme?.id}
      suppressHydrationWarning
      className={cn(dmSans.variable, cormorant.variable, dmMono.variable, "font-sans antialiased")}
    >
      <body>
        {theme && (
          <style href={themeStyleHref(theme)} precedence="metis-theme">
            {theme.css}
          </style>
        )}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <QueryProvider>
            <PlatformPolicyProvider policy={platformPolicy()}>
              {children}
              <Toaster position="bottom-center" richColors />
            </PlatformPolicyProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
