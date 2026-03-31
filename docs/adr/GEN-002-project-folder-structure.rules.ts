/// <reference path="../.archgate/rules.d.ts" />

/** Strip single-line and block comments so patterns don't match comment text. */
function stripComments(src: string): string {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export default {
  rules: {
    "util-must-be-singleton-class": {
      description:
        "Every file in src/util/ must define a singleton class with 'private static instance' and 'static getInstance()' (ADR GEN-002).",
      check: async (ctx) => {
        const files =
          ctx.scopedFiles.length > 0
            ? ctx.scopedFiles.filter((f) => f.includes("src/util/"))
            : await ctx.glob("src/util/*.ts");

        for (const file of files) {
          if (file.endsWith(".test.ts")) continue;

          const raw = await ctx.readFile(file);
          const content = stripComments(raw);

          if (!content.includes("class ")) {
            ctx.report.violation({
              message:
                "src/util/ files must define a singleton class, not plain exports (ADR GEN-002).",
              file,
            });
            continue;
          }

          if (!/private\s+static\s+instance/.test(content)) {
            ctx.report.violation({
              message:
                "Singleton class in src/util/ must have a 'private static instance' property (ADR GEN-002).",
              file,
            });
          }

          if (!/static\s+getInstance\s*\(/.test(content)) {
            ctx.report.violation({
              message:
                "Singleton class in src/util/ must have a 'static getInstance()' method (ADR GEN-002).",
              file,
            });
          }
        }
      },
    },

    "util-no-exported-functions": {
      description:
        "src/util/ files must not export plain functions. All logic must be methods on the singleton class (ADR GEN-002).",
      check: async (ctx) => {
        const files =
          ctx.scopedFiles.length > 0
            ? ctx.scopedFiles.filter((f) => f.includes("src/util/"))
            : await ctx.glob("src/util/*.ts");

        for (const file of files) {
          if (file.endsWith(".test.ts")) continue;

          const raw = await ctx.readFile(file);
          const content = stripComments(raw);

          if (/^export\s+(async\s+)?function\s+\w+/m.test(content)) {
            ctx.report.violation({
              message:
                "src/util/ must not export plain functions. Move logic into a singleton class method (ADR GEN-002).",
              file,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
