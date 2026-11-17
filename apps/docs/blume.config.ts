import { defineConfig } from "blume";

export default defineConfig({
  title: "Metis Suite Docs",
  description:
    "Guides for people who use Metis Suite, for Metis Cloud customers and for the admins who self-host it.",
  logo: { image: "/logo.svg", text: "Metis Suite" },
  content: {
    root: "content",
  },
  deployment: {
    site: "https://docs.trymetis.email",
  },
  theme: {
    accent: { light: "#18181b", dark: "#e4e4e7" },
    background: { light: "#f7f7f8", dark: "#000000" },
    fonts: {
      display: "inter",
      body: "inter",
      mono: "jetbrains-mono",
    },
  },
  navigation: {
    tabs: [
      { label: "User Guide", path: "/guide", icon: "mail" },
      { label: "Self-Hosting Guide", path: "/self-hosting", icon: "server" },
      { label: "Metis Cloud", path: "/cloud", icon: "cloud" },
      { label: "Changelog", path: "/changelog", icon: "history" },
    ],
  },
});
