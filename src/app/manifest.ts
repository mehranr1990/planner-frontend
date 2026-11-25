import type { MetadataRoute } from "next";

/*
 * Installable web app (Android / desktop install, iOS "Add to Home Screen").
 * iOS/iPadOS deliver Web Push only to a Home Screen app, which needs this
 * standalone manifest. No offline caching is implied: sw.js is push-only.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Mehran Planner",
    short_name: "Planner",
    lang: "fa",
    dir: "rtl",
    start_url: "/personal",
    scope: "/",
    display: "standalone",
    background_color: "#F4F6F3",
    theme_color: "#0E6B57",
    // Install needs PNGs at 192 and 512; the maskable one keeps the mark in the safe zone.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
