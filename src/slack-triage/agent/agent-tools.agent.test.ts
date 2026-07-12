import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PreToolUseHookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { buildAgentToolsConfig } from "@/slack-triage/agent/agent-tools";
import { logger } from "@/util/logger";

vi.mock("@/util/logger");

// Test constants
const TOOL_NAME_BASH = "Bash";
const TOOL_NAME_READ = "Read";
const TOOL_NAME_SKILL = "Skill";
const MOCK_TOOL_USE_ID = "t-123";
const MOCK_SESSION_ID = "s-123";
const HOOK_ARRAY_INDEX = 0;

// Helper: Type-safe accessor for permission decision from HookJSONOutput union
function permissionDecisionOf(result: HookJSONOutput): string | undefined {
  return (result as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
    ?.permissionDecision;
}

// Helper: Create abort signal
function createAbortSignal(): AbortSignal {
  return new AbortController().signal;
}

// Helper: Build hook input with command
function bashHookInput(command: string): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: TOOL_NAME_BASH,
    tool_input: { command },
    tool_use_id: MOCK_TOOL_USE_ID,
    session_id: MOCK_SESSION_ID,
    transcript_path: "/tmp/transcript",
    cwd: "/tmp",
  };
}

// Helper: Build hook input for non-Bash tools
function nonBashHookInput(toolName: string): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { path: "/file" },
    tool_use_id: MOCK_TOOL_USE_ID,
    session_id: MOCK_SESSION_ID,
    transcript_path: "/tmp",
    cwd: "/tmp",
  };
}

// eslint-disable-next-line max-lines-per-function
describe("buildAgentToolsConfig", () => {
  let hookFn: (
    input: PreToolUseHookInput,
    toolUseID: string | undefined,
    options: { signal: AbortSignal },
  ) => Promise<HookJSONOutput>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SLACK_CLI_MASTER_KEY;
    const config = buildAgentToolsConfig();
    const hook = config.hooks?.PreToolUse?.[HOOK_ARRAY_INDEX].hooks[HOOK_ARRAY_INDEX];
    if (!hook) throw new Error("Hook not found");
    hookFn = hook;
  });

  const callHook = async (input: PreToolUseHookInput): Promise<HookJSONOutput> =>
    hookFn(input, MOCK_TOOL_USE_ID, { signal: createAbortSignal() });

  describe("TS1 - Config shape", () => {
    it("returns config with skills and PreToolUse hook", () => {
      const config = buildAgentToolsConfig();
      expect(config.skills).toContain("use-slack");
      expect(config.skills).toContain("use-linear");
      expect(config.allowedTools).toContain(TOOL_NAME_BASH);
      expect(config.hooks?.PreToolUse).toBeDefined();
    });
  });

  describe("TS2 - Deny destructive Linear commands", () => {
    it("denies linear issue delete", async () => {
      const result = await callHook(bashHookInput("linear issue delete ENG-1"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies linear issue archive", async () => {
      const result = await callHook(bashHookInput("linear issue archive ENG-1"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies linear issue cancel", async () => {
      const result = await callHook(bashHookInput("linear issue cancel ENG-1"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies linear issue update --state", async () => {
      const result = await callHook(bashHookInput("linear issue update ENG-1 --state DONE"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies linear issue start", async () => {
      const result = await callHook(bashHookInput("linear issue start ENG-1"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies destructive command in shell chain", async () => {
      const result = await callHook(bashHookInput("echo hi && linear issue delete ENG-1"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });
  });

  describe("TS3 - Deny Slack write commands", () => {
    it("denies slack-cli send", async () => {
      const result = await callHook(bashHookInput("slack-cli send -c channel -m message"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies slack-cli edit", async () => {
      const result = await callHook(bashHookInput("slack-cli edit --ts 123456 -m updated"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies slack-cli delete", async () => {
      const result = await callHook(bashHookInput("slack-cli delete --ts 123456"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies slack-cli upload", async () => {
      const result = await callHook(
        bashHookInput("slack-cli upload --path /file.txt --channel #dev"),
      );
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies slack-cli reaction", async () => {
      const result = await callHook(
        bashHookInput("slack-cli reaction add --emoji thumbsup --ts 123"),
      );
      expect(permissionDecisionOf(result)).toBe("deny");
    });

    it("denies slack-cli pin", async () => {
      const result = await callHook(bashHookInput("slack-cli pin --ts 123456"));
      expect(permissionDecisionOf(result)).toBe("deny");
    });
  });

  describe("TS4 - Allow reads and creates", () => {
    it("allows linear issue create", async () => {
      const result = await callHook(bashHookInput("linear issue create --json --title 'Bug'"));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });

    it("allows linear issue query", async () => {
      const result = await callHook(bashHookInput("linear issue query --state Todo"));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });

    it("allows slack-cli search", async () => {
      const result = await callHook(bashHookInput("slack-cli search 'bug report'"));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });

    it("allows slack-cli history", async () => {
      const result = await callHook(bashHookInput("slack-cli history --channel #dev"));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });

    it("allows benign commands", async () => {
      const result = await callHook(bashHookInput("echo hello"));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });
  });

  describe("Tool isolation", () => {
    it("allows non-Bash tools (Read)", async () => {
      const result = await callHook(nonBashHookInput(TOOL_NAME_READ));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });

    it("allows non-Bash tools (Skill)", async () => {
      const result = await callHook(nonBashHookInput(TOOL_NAME_SKILL));
      expect(permissionDecisionOf(result)).not.toBe("deny");
    });
  });

  describe("Slack auth degradation", () => {
    it("logs warning when SLACK_CLI_MASTER_KEY unset", () => {
      vi.clearAllMocks();
      delete process.env.SLACK_CLI_MASTER_KEY;
      buildAgentToolsConfig();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("SLACK_CLI_MASTER_KEY"));
    });

    it("no warning when SLACK_CLI_MASTER_KEY is set", () => {
      process.env.SLACK_CLI_MASTER_KEY = "test-token";
      vi.clearAllMocks();
      buildAgentToolsConfig();
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("SLACK_CLI_MASTER_KEY"));
    });
  });
});
