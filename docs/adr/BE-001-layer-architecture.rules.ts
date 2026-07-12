/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "no-service-layer": {
      description:
        "The 'service' layer does not exist in BE-001. Use coordinator, command, query, repository, datasource, or transfer instead.",
      check: async (ctx: {
        scopedFiles: string | any[];
        glob: (arg0: string) => any;
        report: { violation: (arg0: { message: string; file: any }) => void };
      }) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          const fileName = file.split("/").pop() || "";
          if (fileName.toLowerCase().endsWith(".service.ts")) {
            ctx.report.violation({
              message:
                "Files named '*.service.ts' are not allowed (ADR BE-001). Use .coordinator.ts, .command.ts, .query.ts, .repository.ts, .datasource.ts, or .transfer.ts instead.",
              file,
            });
          }
        }
      },
    },
    "coordinator-must-orchestrate": {
      description:
        "Coordinator must orchestrate at least two participants — a Query, a Command, or a Claude Agent SDK agent session (*.agent) — and at least one must be a Query or Command (ADR BE-001).",
      check: async (ctx: {
        scopedFiles: string | any[];
        glob: (arg0: string) => any;
        readFile: (arg0: any) => any;
        report: { violation: (arg0: { message: string; file: any }) => void };
      }) => {
        const files = ctx.scopedFiles.length > 0 ? ctx.scopedFiles : await ctx.glob("src/**/*.ts");
        for (const file of files) {
          if (file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;
          const fileName = file.split("/").pop() || "";
          if (!fileName.toLowerCase().endsWith(".coordinator.ts")) continue;

          const content = await ctx.readFile(file);
          const hasQuery = /from\s+["'][^"']*\.query["']/.test(content);
          const hasCommand = /from\s+["'][^"']*\.command["']/.test(content);
          const hasAgent = /from\s+["'][^"']*\.agent["']/.test(content);

          const participantCount = [hasQuery, hasCommand, hasAgent].filter(Boolean).length;
          const hasLogicLayer = hasQuery || hasCommand;

          if (participantCount < 2 || !hasLogicLayer) {
            ctx.report.violation({
              message:
                "Coordinator must orchestrate at least two participants among a Query (*.query), a Command (*.command), or an agent session (*.agent), and at least one must be a Query or Command (ADR BE-001). A coordinator that only wraps a single layer is unnecessary.",
              file,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
