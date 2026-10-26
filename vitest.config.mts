import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Store tests chdir into a temp folder (lib/store-file.ts writes to ./data),
    // which worker threads don't allow. Separate processes also keep the
    // file store's in-memory state apart between test files.
    pool: "forks",
    env: { SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long", SITE_URL: "https://example.test" },
  },
});
