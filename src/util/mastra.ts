import { Mastra } from "@mastra/core/mastra";
import { Observability } from "@mastra/observability";
import { SpanType } from "@mastra/core/observability";
import { LangfuseExporter } from "@mastra/langfuse";
import { bugTriageAgent } from "@/slack-triage/agent/bug-triage.agent";
import { triageWorkflow } from "@/slack-triage/workflow/triage.workflow";
import {
  AGENT_NAMES,
  WORKFLOW_NAMES,
  OBSERVABILITY_SERVICE_NAME,
} from "@/constants/mastra.constants";
import { logger } from "@/util/logger";

/**
 * Mastra singleton — owns the single Mastra instance and registers all
 * agents/workflows for the app.
 *
 * Storage/memory is left in-memory (Mastra's default): triage is stateless per
 * turn and conversation history is supplied by the Chat SDK, so no durable
 * store is needed. Wired into NestJS via `MastraModule` in `AppModule`.
 *
 * Observability is configured to integrate with Langfuse for tracing LLM execution.
 * When `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are both set, spans are
 * exported to Langfuse. Otherwise, observability is disabled gracefully so local
 * dev/tests run without Langfuse. Model token chunks are excluded from export
 * to reduce costs (Langfuse charges per-span).
 */
export class MastraProvider {
  private static instance: MastraProvider;
  private readonly _mastra: Mastra;

  private constructor() {
    this._mastra = new Mastra({
      agents: {
        [AGENT_NAMES.bugTriage]: bugTriageAgent,
      },
      workflows: {
        [WORKFLOW_NAMES.triage]: triageWorkflow,
      },
      observability: this.buildObservability(),
    });
  }

  /**
   * Builds the Observability config with Langfuse integration, or returns
   * undefined if Langfuse credentials are not set. Graceful disable allows
   * local dev/tests to run without Langfuse.
   */
  private buildObservability(): Observability | undefined {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL;

    if (!publicKey || !secretKey) {
      logger.warn(
        "[mastra] LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set — observability/tracing disabled",
      );
      return undefined;
    }

    return new Observability({
      configs: {
        default: {
          serviceName: OBSERVABILITY_SERVICE_NAME,
          exporters: [
            new LangfuseExporter({
              publicKey,
              secretKey,
              baseUrl,
            }),
          ],
          excludeSpanTypes: [SpanType.MODEL_CHUNK, SpanType.MODEL_STEP],
        },
      },
    });
  }

  static getInstance(): MastraProvider {
    if (!MastraProvider.instance) {
      MastraProvider.instance = new MastraProvider();
    }
    return MastraProvider.instance;
  }

  mastra(): Mastra {
    return this._mastra;
  }
}

export const mastra = MastraProvider.getInstance().mastra();
