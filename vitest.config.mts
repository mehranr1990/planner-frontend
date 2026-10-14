import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // Pin the zone so date assertions never depend on the machine running them.
    env: { TZ: "Asia/Tehran" },
    // Full-provider renders of Radix-heavy pages are slow under parallel load.
    testTimeout: 15_000,
  },
});
