/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "private-list-property": {
      description: "List Domain classes must have a private 'list' property.",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          const fileName = file.split("/").pop() || "";
          if (fileName.toLowerCase().endsWith("list.ts")) {
            const content = await ctx.readFile(file);
            if (content.includes("class ") && !/\bprivate\s+(readonly\s+)?list\b/.test(content)) {
              ctx.report.violation({
                message: "List Domain must have a private property named 'list' (ADR BE-006).",
                file,
              });
            }
          }
        }
      },
    },
    "no-side-effect-methods": {
      description: "List Domain should not have side-effect methods like add, update, remove.",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          const fileName = file.split("/").pop() || "";
          if (fileName.toLowerCase().endsWith("list.ts")) {
            const content = await ctx.readFile(file);
            const sideEffects = /\b(add|update|remove)\s*\(/g;
            let match;
            while ((match = sideEffects.exec(content)) !== null) {
              ctx.report.violation({
                message: `List Domain should avoid side-effect functions like '${match[0].trim().slice(0, -1)}' (ADR BE-006).`,
                file,
                line: content.substring(0, match.index).split("\n").length,
              });
            }
          }
        }
      },
    },
    "return-new-instance": {
      description: "Operations that modify the collection must return a new instance.",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          const fileName = file.split("/").pop() || "";
          if (fileName.toLowerCase().endsWith("list.ts")) {
            const content = await ctx.readFile(file);
            const filterMethods = /filter\w+\s*\([^)]*\)\s*:\s*(\w+)/g;
            let match;
            while ((match = filterMethods.exec(content)) !== null) {
              const returnType = match[1];
              const classNameMatch = /class\s+(\w+)/.exec(content);
              const className = classNameMatch ? classNameMatch[1] : null;
              if (className && returnType !== className) {
                ctx.report.violation({
                  message: `Filtering methods should return a new instance of ${className} (ADR BE-006).`,
                  file,
                  line: content.substring(0, match.index).split("\n").length,
                });
              }
            }
          }
        }
      },
    },
  },
} satisfies RuleSet;
