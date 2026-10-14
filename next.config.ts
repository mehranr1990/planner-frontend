import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Resolves ./src/i18n/request.ts (cookie-based locale, no locale routing).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
