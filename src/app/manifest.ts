import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planify — Teman belajar yang menyesuaikan",
    short_name: "Planify",
    description: "Rencana belajar yang terasa mungkin untuk minggu kamu.",
    start_url: "/hari-ini",
    scope: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#315342",
    lang: "id",
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
