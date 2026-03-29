/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "no-magic-numbers": {
      description: "Business logic should not use magic numbers (ADR GEN-001).",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          if (file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;

          const content = await ctx.readFile(file);
          // Look for number literals in comparisons or assignments
          // This regex is a bit simplistic but catches common cases
          const magicNumberRegex = /\b(>|<|===|!==|==|!=)\s*([0-9]{2,}|[2-9])\b/g;
          let match;
          while ((match = magicNumberRegex.exec(content)) !== null) {
            ctx.report.violation({
              message: `Potential magic number '${match[2]}' found. Use a named constant instead (ADR GEN-001).`,
              file,
              line: content.substring(0, match.index).split("\n").length,
            });
          }
        }
      },
    },
    "no-magic-strings": {
      description: "Status or configuration strings should not be hardcoded (ADR GEN-001).",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          if (file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;
          if (file.includes("util/")) continue; // Utils might have low-level strings
          if (file.includes("constants/")) continue;
          if (file.includes("docs/")) continue; // Rule files might contain example patterns
          if (file.endsWith(".config.ts")) continue;

          const content = await ctx.readFile(file);
          // Look for string literals in comparisons (=== or !==)
          // We exclude common technical strings and common patterns
          const magicStringRegex = /(?:===|!==)\s*"([^"\n]+)"/g;
          let match;
          while ((match = magicStringRegex.exec(content)) !== null) {
            const value = match[1];
            if (
              [
                "string",
                "object",
                "undefined",
                "number",
                "boolean",
                "symbol",
                "bigint",
                "function",
                "fulfilled",
                "rejected",
              ].includes(value)
            )
              continue;

            ctx.report.violation({
              message: `Potential magic string '${value}' found. Use a constant or type union instead (ADR GEN-001).`,
              file,
              line: content.substring(0, match.index).split("\n").length,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
