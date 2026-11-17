import { Toaster } from "@metis/ui/components/sonner";
import { cn } from "@metis/ui/lib/utils";

import "@/lib/orpc.server";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";

import "@/styles/globals.css";
import { PlatformPolicyProvider } from "@/components/platform-policy-context";
import { themeStyleHref } from "@/theme/active";
import { resolveActiveTheme } from "@/theme/resolve";
import { platformPolicy } from "@/workspace/policy";

import { QueryProvider } from "./_components/query-provider";
import { ThemeProvider } from "./_components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
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
      className={cn(inter.variable, jetbrainsMono.variable, "font-sans antialiased")}
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
