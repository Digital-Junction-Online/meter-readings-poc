import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WM — Wayne's Meter Readings",
    short_name: "WM Readings",
    description: "Electricity & water meter readings for your property",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0c1f3d",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
