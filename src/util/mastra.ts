import { Mastra } from "@mastra/core/mastra";
import { bugTriageAgent } from "@/slack-bug-intake/agent/bug-triage.agent";
import { bugTriageWorkflow } from "@/slack-bug-intake/workflow/bug-triage.workflow";
import { AGENT_NAMES, WORKFLOW_NAMES } from "@/constants/mastra.constants";

/**
 * Mastra singleton — owns the single Mastra instance and registers all
 * agents/workflows for the app.
 *
 * Storage/memory is left in-memory (Mastra's default): triage is stateless per
 * turn and conversation history is supplied by the Chat SDK, so no durable
 * store is needed. Wired into NestJS via `MastraModule` in `AppModule`.
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
        [WORKFLOW_NAMES.bugTriage]: bugTriageWorkflow,
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
