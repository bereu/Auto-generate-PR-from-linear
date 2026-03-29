/// <reference types="vitest" />
import { defineConfig } from "vite-plus";
import oxlintPlugin from "vite-plugin-oxlint";
import oxlintRules from "./.oxlintrc.json" with { type: "json" };

export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    target: "node22",
  },
  staged: {
    "*": "vp check --fix",
  },
  plugins: [
    oxlintPlugin({
      configFile: "oxlint.config.js",
    }),
  ],
  lint: {
    ...(oxlintRules as object),
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "node",
  },
});
