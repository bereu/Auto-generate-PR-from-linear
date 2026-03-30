/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "private-value-property": {
      description: "Value Domain classes must have a private '_value' property.",
      check: async (ctx: {
        scopedFiles: string | any[];
        glob: (arg0: string) => any;
        readFile: (arg0: any) => any;
        report: { violation: (arg0: { message: string; file: any }) => void };
      }) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          if (file.includes("docs/")) continue;
          const fileName = file.split("/").pop() || "";
          // Value domains are usually *Id.ts, *Status.ts, or follow the BE-005 ADR
          // We can check if the file content suggests it's a Value Domain or if filename matches common patterns
          const content = await ctx.readFile(file);
          if (
            content.includes("class ") &&
            (fileName.toLowerCase().endsWith("id.ts") ||
              fileName.toLowerCase().endsWith("status.ts") ||
              content.includes("ValueDomain"))
          ) {
            if (!/\bprivate\s+(readonly\s+)?_value\b/.test(content)) {
              ctx.report.violation({
                message: "Value Domain must have a private property named '_value' (ADR BE-005).",
                file,
              });
            }
          }
        }
      },
    },
    "value-getter": {
      description: "Value Domain must have a .value() getter method.",
      check: async (ctx) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          if (file.includes("docs/")) continue;
          const fileName = file.split("/").pop() || "";
          if (
            fileName.toLowerCase().endsWith("id.ts") ||
            fileName.toLowerCase().endsWith("status.ts")
          ) {
            const content = await ctx.readFile(file);
            if (content.includes("class ") && !/\bvalue\s*\(\s*\)/.test(content)) {
              ctx.report.violation({
                message: "Value Domain must have a .value() getter method (ADR BE-005).",
                file,
              });
            }
          }
        }
      },
    },
  },
} satisfies RuleSet;
