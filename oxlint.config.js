import { defineConfig } from "oxlint";
import oxlintRules from "./.oxlintrc.json" with { type: "json" };

// eslint-disable-next-line eslint-plugin-import/no-default-export
export default defineConfig({
  ...oxlintRules,
  plugins: [...(oxlintRules.plugins || []), "./.archgate/lint/oxlint.js"],
  rules: {
    ...(oxlintRules.rules || {}),
    "archgate/private-value-property": "error",
    "archgate/value-getter": "error",
    "archgate/private-list-property": "error",
    "archgate/no-magic-numbers": "error",
    "archgate/no-magic-strings": "error",
    "archgate/util-must-be-singleton-class": "error",
    "archgate/util-no-exported-functions": "error",
  },
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
