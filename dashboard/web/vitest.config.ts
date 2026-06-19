/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/redesign/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/redesign/lib/**/*.{ts,tsx}",
        "src/redesign/components/**/*.{ts,tsx}",
        "src/redesign/RedesignApp.tsx",
      ],
      exclude: [
        "src/redesign/main.tsx",
        "src/redesign/test/**",
        "src/**/*.d.ts",
        "src/vite-env.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.css",
        "node_modules/**",
      ],
    },
  },
  server: {
    fs: {
      allow: ["..", "../..", "../../.."],
    },
  },
});
