import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": "/Users/soheieto/sandbox/auto-generate-code-from-linear/src",
    },
  },
  test: {
    environment: "node",
  },
});
