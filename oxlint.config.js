import { defineConfig } from "oxlint";
import oxlintRules from "./.oxlintrc.json" with { type: "json" };

// eslint-disable-next-line eslint-plugin-import/no-default-export
export default defineConfig({
  ...oxlintRules,
  rules: {
    ...oxlintRules.rules,
    "no-relative-import-paths/no-relative-import-paths": "error",
  },
  jsPlugins: ["eslint-plugin-no-relative-import-paths"],
  overrides: [
    {
      files: ["client/src/**/*.tsx", "client/src/**/*.ts"],
      plugins: ["react"],
    },
    {
      files: ["server/test/**/*.ts"],
      rules: {
        "typescript/unbound-method": "off",
      },
    },
  ],
});
