import { Injectable } from "@nestjs/common";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Message, Thread } from "chat";
import { langfuse } from "@/util/langfuse";
import { logger } from "@/util/logger";
import { buildAgentToolsConfig } from "@/slack-triage/agent/agent-tools";
import {
  TRIAGE_AGENT_MODEL,
  TRIAGE_MAX_TURNS,
  CLAUDE_MESSAGE_TYPES,
} from "@/constants/agent.constants";

// Tool-input log truncation window (mirrors the pattern in src/agent.ts).
const LOG_TRUNCATE_START = 0;
const LOG_TRUNCATE_END = 200;
// Array index constants (avoid inline magic numbers per GEN-001).
const ARRAY_FIRST_INDEX = 0;

/**
 * Stream message from Claude Agent SDK query.
 */
interface ClaudeStreamMessage {
  type: string;
  message?: {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  subtype?: string;
}

/**
 * Result message from the Claude Agent SDK query stream.
 * Indicates the terminal state of the agentic session.
 */
interface ClaudeResultMessage {
  type: "result";
  subtype?: string;
  usage?: { total_tokens?: number };
}

/**
 * Content block from an assistant message.
 */
interface ContentBlock {
  type: string;
  text?: string;
}

/**
 * Parsed agent response (from system prompt contract).
 */
interface AgentResponse {
  action: string;
  message?: string;
  title?: string;
  description?: string;
  difficulty?: string;
  issueId?: string;
}

/**
 * Triage turn outcome — what the coordinator should do next.
 */
export interface TriageTurnOutcome {
  action: "answered_question" | "asked_clarifying_question" | "created_issue" | "error";
  message: string;
  issueUrl?: string;
  issueId?: string;
  difficulty?: "easy" | "medium" | "hard";
  maxRoundsReached?: boolean;
}

/**
 * TriageAgent: runs a single agentic Claude Agent SDK `query()` session per
 * Slack thread turn. Orchestrates intent classification, clarification, and
 * Linear issue creation via CLI skills.
 *
 * **Coordinator-layer responsibility (per BE-001):**
 * - Assemble the prompt from the thread's recent messages
 * - Run the query() session with configured skills and tool scopes
 * - Parse the stream and detect the terminal result message
 * - Return a typed turn-outcome (action, message, issueUrl, issueId, etc.)
 * - Any deterministic business guarantee (Linear label/state) is enforced by a
 *   subsequent Command in the Coordinator layer (reconciliation pattern).
 *
 * **CLI/Skill access:**
 * - Linear CLI (via use-linear skill): create, list, get (allowed)
 * - Slack CLI (via use-slack skill): search, read (allowed, optional, read/search only)
 * - Destructive/write commands: denied by PreToolUse hook (fail closed)
 */
@Injectable()
export class TriageAgent {
  private readonly jsonBlockRegex = /\{[\s\S]*\}/;

  /**
   * Run a single triage turn: classify intent, ask clarifying question, or
   * create a Linear issue from the thread's recent messages.
   *
   * @param thread Chat SDK thread with `recentMessages` and thread metadata
   * @returns Turn outcome: action, message, issueUrl (if created), etc.
   */
  async run(thread: Thread): Promise<TriageTurnOutcome> {
    try {
      const prompt = this.buildTriagePrompt(thread.recentMessages);
      const systemPrompt = await langfuse.fetchTriageAgentPrompt();
      const toolsConfig = buildAgentToolsConfig();

      logger.info(`[triage-agent] Starting triage session (max ${TRIAGE_MAX_TURNS} turns)`);

      const streamData = await this.collectStreamMessages(prompt, systemPrompt, toolsConfig);
      const outcome = this.buildOutcomeFromStream(streamData);

      if (outcome.action === "error" && outcome.maxRoundsReached) {
        logger.warn("[triage-agent] Max clarification rounds reached");
      }

      logger.info(`[triage-agent] Turn outcome: ${outcome.action}`);
      return outcome;
    } catch (error) {
      logger.error("[triage-agent] Unhandled error during triage", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return { action: "error", message: "Triage agent encountered an error" };
    }
  }

  /**
   * Build the user prompt from recent thread messages.
   */
  private buildTriagePrompt(messages: Message[]): string {
    const messageText = messages
      .map((m) => {
        const author = (m as unknown as { author?: string | (() => string) }).author;
        const text = (m as unknown as { text?: string | (() => string) }).text;
        const authorStr = typeof author === "function" ? author() : author;
        const textStr = typeof text === "function" ? text() : text;
        return `${authorStr}: ${textStr}`;
      })
      .join("\n");
    return `Recent conversation:\n${messageText}\n\nBased on the conversation above, analyze the user's intent and determine the next action.\nReturn your response as JSON in the format specified by your system prompt.`.trim();
  }

  /**
   * Build query options from tools config.
   */
  private buildQueryOptions(
    systemPrompt: string,
    toolsConfig: ReturnType<typeof buildAgentToolsConfig>,
  ) {
    return {
      systemPrompt,
      model: TRIAGE_AGENT_MODEL,
      cwd: process.cwd(),
      settingSources: toolsConfig.settingSources,
      skills: toolsConfig.skills,
      allowedTools: toolsConfig.allowedTools,
      disallowedTools: toolsConfig.disallowedTools,
      hooks: toolsConfig.hooks,
      maxTurns: TRIAGE_MAX_TURNS,
    };
  }

  /**
   * Collect all messages from the query stream.
   */
  // Single-pass accumulation over the query stream; the per-message-type branches share
  // the loop's local state, so extracting them would obscure more than it clarifies (complexity 6 vs 5).
  // eslint-disable-next-line complexity
  private async collectStreamMessages(
    prompt: string,
    systemPrompt: string,
    toolsConfig: ReturnType<typeof buildAgentToolsConfig>,
  ): Promise<{ lastMessage: string; result: ClaudeResultMessage | null }> {
    let lastMessage = "";
    let result: ClaudeResultMessage | null = null;

    for await (const msg of query({
      prompt,
      options: this.buildQueryOptions(systemPrompt, toolsConfig) as Record<string, unknown>,
    })) {
      this.logMessage(msg);
      const streamMsg = msg as ClaudeStreamMessage;
      if (streamMsg.type === "assistant" && streamMsg.message?.content) {
        lastMessage = this.extractTextFromMessage(streamMsg.message.content);
      }
      if (streamMsg.type === CLAUDE_MESSAGE_TYPES.result) {
        result = streamMsg as ClaudeResultMessage;
      }
    }

    return { lastMessage, result };
  }

  /**
   * Build outcome from collected stream data.
   */
  private buildOutcomeFromStream(streamData: {
    lastMessage: string;
    result: ClaudeResultMessage | null;
  }): TriageTurnOutcome {
    if (!streamData.result) {
      logger.warn("[triage-agent] No result message received from query stream");
      return { action: "error", message: "Triage agent did not produce a result" };
    }

    if (streamData.result.subtype === "error_max_turns") {
      return { action: "error", message: "Triage hit max turns", maxRoundsReached: true };
    }

    if (streamData.result.usage?.total_tokens) {
      logger.info(`[triage-agent] Token usage: ${streamData.result.usage.total_tokens}`);
    }

    return this.parseAgentResponse(streamData.lastMessage);
  }

  /**
   * Extract text content from an assistant message's content blocks.
   */
  private extractTextFromMessage(content: ContentBlock[]): string {
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text ?? "")
      .join("\n");
  }

  /**
   * Parse the agent's JSON response.
   */
  private parseAgentResponse(responseText: string): TriageTurnOutcome {
    if (!responseText) {
      logger.warn("[triage-agent] Agent produced no text response");
      return { action: "error", message: "Agent produced no response" };
    }

    const jsonBlock = this.extractJsonBlock(responseText);
    if (!jsonBlock) {
      logger.warn("[triage-agent] No JSON found in agent response");
      return { action: "error", message: "Agent response was not JSON" };
    }

    return this.parseJsonAndBuildOutcome(jsonBlock);
  }

  /**
   * Extract JSON block from response text.
   */
  private extractJsonBlock(responseText: string): string | null {
    const match = responseText.match(this.jsonBlockRegex);
    return match ? match[ARRAY_FIRST_INDEX] : null;
  }

  /**
   * Parse JSON and build outcome.
   */
  private parseJsonAndBuildOutcome(jsonBlock: string): TriageTurnOutcome {
    try {
      const parsedData = JSON.parse(jsonBlock) as unknown;
      const parsed = parsedData as AgentResponse;
      const action = parsed.action?.toLowerCase();

      if (!this.isValidAction(action)) {
        logger.warn("[triage-agent] Unknown action in agent response");
        return { action: "error", message: `Unknown action: ${action}` };
      }

      return this.buildOutcomeForAction(action, parsed);
    } catch (error) {
      logger.error("[triage-agent] Failed to parse agent response", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return { action: "error", message: "Failed to parse agent response" };
    }
  }

  /**
   * Check if action is valid.
   */
  private isValidAction(action: string | undefined): boolean {
    const validActions = ["answered_question", "asked_clarifying_question", "create_issue"];
    return action ? validActions.includes(action) : false;
  }

  /**
   * Build outcome based on action type.
   */
  // Action dispatcher: branches map 1:1 to the agent's action types and read more
  // clearly inline than split across helpers (complexity 6 vs 5).
  // eslint-disable-next-line complexity
  private buildOutcomeForAction(action: string, parsed: AgentResponse): TriageTurnOutcome {
    const message = parsed.message ?? "";

    if (action === "answered_question" || action === "asked_clarifying_question") {
      return {
        action: action as "answered_question" | "asked_clarifying_question",
        message,
      };
    }

    if (action === "create_issue") {
      return this.buildCreateIssueOutcome(message, parsed);
    }

    return { action: "error", message: "Unexpected action result" };
  }

  /**
   * Build outcome for create_issue action.
   */
  // Complexity here is entirely defensive null-coalescing while assembling the outcome
  // object; splitting it would not improve readability (complexity 6 vs 5).
  // eslint-disable-next-line complexity
  private buildCreateIssueOutcome(message: string, parsed: AgentResponse): TriageTurnOutcome {
    const issueId = parsed.issueId ?? null;
    if (!issueId) {
      logger.warn(
        "[triage-agent] create_issue action produced no issueId; reconciliation may skip",
      );
    }
    return {
      action: "created_issue",
      message: message ?? "Issue created",
      issueId: issueId ?? undefined,
      issueUrl: issueId ? `https://linear.app/issue/${issueId}` : undefined,
      difficulty: (parsed.difficulty as "easy" | "medium" | "hard") ?? undefined,
    };
  }

  /**
   * Log message details from the stream.
   */
  // Two independent message-type logging branches; splitting them adds indirection
  // without improving clarity (complexity 6 vs 5).
  // eslint-disable-next-line complexity
  private logMessage(msg: unknown): void {
    const msgObj = msg as ClaudeStreamMessage;

    if (msgObj.type === CLAUDE_MESSAGE_TYPES.assistant && msgObj.message?.content) {
      this.logToolUse(msgObj.message.content);
    }

    if (msgObj.type === CLAUDE_MESSAGE_TYPES.result) {
      logger.debug(`[triage-agent] Result: ${msgObj.subtype ?? "success"}`);
    }
  }

  /**
   * Log tool use blocks from assistant content.
   */
  private logToolUse(content: Array<{ type: string; name?: string; input?: unknown }>): void {
    content.forEach((block) => {
      if (block.type === "tool_use") {
        const toolName = block.name ?? "unknown";
        const toolInput = block.input
          ? JSON.stringify(block.input).slice(LOG_TRUNCATE_START, LOG_TRUNCATE_END)
          : "{}";
        logger.debug(`[triage-agent] Tool: ${toolName} | Input: ${toolInput}`);
      }
    });
  }
}
