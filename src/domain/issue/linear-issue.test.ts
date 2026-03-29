import { describe, it, expect } from "vitest";
import { IssueId } from "@/domain/issue/value/issue-id";
import { IssueTitle } from "@/domain/issue/value/issue-title";
import { LinearIssue } from "@/domain/issue/linear-issue";

describe("IssueId", () => {
  it("creates a valid IssueId", () => {
    const id = IssueId.of("abc-123");
    expect(id.value()).toBe("abc-123");
  });

  it("throws when id is empty string", () => {
    expect(() => IssueId.of("")).toThrow("IssueId must be a non-empty string");
  });

  it("equals returns true for same value", () => {
    expect(IssueId.of("x").equals(IssueId.of("x"))).toBe(true);
  });

  it("equals returns false for different values", () => {
    expect(IssueId.of("x").equals(IssueId.of("y"))).toBe(false);
  });
});

describe("IssueTitle", () => {
  it("creates a valid IssueTitle", () => {
    const title = IssueTitle.create("Fix login");
    expect(title.value()).toBe("Fix login");
  });

  it("throws when title is empty string", () => {
    expect(() => IssueTitle.create("")).toThrow("IssueTitle must be a non-empty string");
  });

  it("withSuspendPrefix prepends [SUSPEND]", () => {
    const suspended = IssueTitle.create("Fix login").withSuspendPrefix();
    expect(suspended.value()).toBe("[SUSPEND] Fix login");
  });

  it("withSuspendPrefix is idempotent — does not double-prefix", () => {
    const alreadySuspended = IssueTitle.create("[SUSPEND] Fix login").withSuspendPrefix();
    expect(alreadySuspended.value()).toBe("[SUSPEND] Fix login");
  });
});

describe("LinearIssue", () => {
  it("reconstructs a valid domain object", () => {
    const issue = LinearIssue.reconstruct("id-1", "Fix bug", "desc", "http://url", ["agent"]);
    expect(issue.id().value()).toBe("id-1");
    expect(issue.title().value()).toBe("Fix bug");
    expect(issue.description()).toBe("desc");
    expect(issue.url()).toBe("http://url");
    expect(issue.labels()).toEqual(["agent"]);
  });

  it("throws when id is empty", () => {
    expect(() => LinearIssue.reconstruct("", "Fix bug", null, "http://url", [])).toThrow(
      "IssueId must be a non-empty string",
    );
  });

  it("throws when title is empty", () => {
    expect(() => LinearIssue.reconstruct("id-1", "", null, "http://url", [])).toThrow(
      "IssueTitle must be a non-empty string",
    );
  });

  it("hasLabel returns true when label exists", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", ["agent", "bug"]);
    expect(issue.hasLabel("agent")).toBe(true);
  });

  it("hasLabel returns false when label is absent", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", ["bug"]);
    expect(issue.hasLabel("agent")).toBe(false);
  });

  it("isAgentIssue returns true when agent label is present", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", ["agent"]);
    expect(issue.isAgentIssue("agent")).toBe(true);
  });

  it("isAgentIssue returns false when agent label is absent", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", ["bug"]);
    expect(issue.isAgentIssue("agent")).toBe(false);
  });

  it("labels returns a copy — mutations do not affect the domain", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", ["agent"]);
    const labels = issue.labels();
    labels.push("extra");
    expect(issue.labels()).toEqual(["agent"]);
  });

  it("description returns null when not provided", () => {
    const issue = LinearIssue.reconstruct("id-1", "title", null, "url", []);
    expect(issue.description()).toBeNull();
  });
});
