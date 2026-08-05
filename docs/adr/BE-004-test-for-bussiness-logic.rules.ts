/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "tests-only-for-business-logic-layers": {
      description:
        "Unit tests are ONLY allowed for Coordinator, Query, and Command layers. No tests for Repository, DataSource, Transfer, or other layers (ADR BE-004).",
      check: async (ctx: {
        scopedFiles: string | any[];
        glob: (arg0: string) => any;
        report: { violation: (arg0: { message: string; file: any }) => void };
      }) => {
        const files =
          ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.{test,spec}.ts");

        // Define allowed test layer patterns
        const allowedPatterns = [
          /\.coordinator\.(test|spec)\.ts$/i,
          /\.query\.(test|spec)\.ts$/i,
          /\.command\.(test|spec)\.ts$/i,
          // Agent layer: Claude Agent SDK sessions (*.agent.ts) carry security-critical
          // business logic (e.g. tool deny-hooks); their tests are permitted (ADR BE-004).
          /\.agent\.(test|spec)\.ts$/i,
        ];

        // Define forbidden test layer patterns
        const forbiddenPatterns = [
          { pattern: /\.repository\.(test|spec)\.ts$/i, layer: "Repository" },
          { pattern: /\.datasource\.(test|spec)\.ts$/i, layer: "DataSource" },
          { pattern: /\.transfer\.(test|spec)\.ts$/i, layer: "Transfer" },
          { pattern: /\.entity\.(test|spec)\.ts$/i, layer: "Entity" },
          { pattern: /\.value\.(test|spec)\.ts$/i, layer: "Value" },
        ];

        for (const file of files) {
          // Skip non-test files
          if (!file.endsWith(".test.ts") && !file.endsWith(".spec.ts")) continue;

          const fileName = file.split("/").pop() || "";

          // Check if it matches a forbidden pattern
          for (const { pattern, layer } of forbiddenPatterns) {
            if (pattern.test(fileName)) {
              ctx.report.violation({
                message: `Test file for ${layer} layer is not allowed (ADR BE-004). Tests are ONLY permitted for Coordinator, Query, and Command layers. Remove this test file.`,
                file,
              });
              break;
            }
          }

          // Check if it's a test file but doesn't match allowed patterns
          const isAllowed = allowedPatterns.some((pattern) => pattern.test(fileName));
          if (!isAllowed && !forbiddenPatterns.some((f) => f.pattern.test(fileName))) {
            // Generic test file that doesn't follow layer naming
            ctx.report.violation({
              message: `Test files must be explicitly named for the layer being tested (ADR BE-004). Use *.coordinator.test.ts, *.query.test.ts, *.command.test.ts, or *.agent.test.ts. Other layers must not have tests.`,
              file,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
