import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Resolves ./src/i18n/request.ts (cookie-based locale, no locale routing).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // `next dev` opened from a phone on the LAN (http://192.168.x.x:port): without this, Next blocks
  // its dev resources for that origin and the page never becomes fully interactive. Dev only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  partialPrefetching: true,
  // The push-only service worker: always revalidated, never broader than the site.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
