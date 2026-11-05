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
    accent: "blue",
    fonts: {
      display: "dm-sans",
      body: "dm-sans",
      mono: { name: "DM Mono", weights: [400, 500] },
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
