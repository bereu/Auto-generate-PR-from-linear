---
name: implement-feature
description: Use this skill to implement a feature from an active execution plan in docs/exec-plans/active/. Reads the plan, implements each action item, marks tasks complete, and moves the plan to completed when done.
version: 1.0.0
skill: [agent-browser]
---

## Overview

This skill drives feature implementation from a structured execution plan. It:

1. Reads the target exec plan
2. Reviews docs/INDEX.md and relevant source files to orient in the codebase
3. Implements each action item in the plan sequentially, marking [ ] as [x] when done
4. Adheres to project conventions from docs/DESIGN.md, docs/TECH_STACK.md, and docs/QUALITY_SCORE.md
5. Moves the completed plan file to docs/exec-plans/completed/ when all items are done

## Steps

### Step 1 — Load the plan

If the user provides a plan filename or feature name, locate it in `docs/exec-plans/active/`. If none is specified, list all active plans and ask the user which one to implement.

Read the full plan. Note:

- **Action List**: the ordered task checklist
- **AC (Acceptance Criteria)**: the definition of done
- **Plan Overview / Why It Is Needed**: context for making sound implementation decisions
- **Linear Ticket ID**: Identify the corresponding Linear ticket (e.g., LIN-XXX).

### Step 1.5 — Sync with Linear

Once the plan is loaded, update the Linear ticket status to `In Progress` using the `linear-cli` commands defined in the `linear-management` skill.

### Step 2 — Orient in the codebase

Read `docs/INDEX.md` to understand directory layout. Based on which parts of the codebase the plan touches, read the relevant source files before writing any code. Do not propose changes to code you have not read.

Also read:

- `docs/DESIGN.md` — module design rules, error handling patterns (Result type), state management
- `docs/TECH_STACK.md` — libraries and stack details (use only what is already in the stack unless the plan explicitly adds a dependency)
- `docs/QUALITY_SCORE.md` — quality and testing bar to meet

### Step 3 — Implement action items

Work through the Action List in order. For each item:

1. Read the affected files.
2. Make the minimal, focused change needed.
3. Check the item off in the plan file: `- [ ]` → `- [x]`.
4. Save the plan file after each item so progress is visible.

Follow project conventions strictly:

- Use the Result type for error handling (do not throw where the codebase uses Result).
- Do not add dependencies not already in the stack unless the plan calls for it.
- Write or update tests for any logic you add (unit tests in `tests/unit/`, integration tests in `tests/integration/` as appropriate).
- Keep changes minimal — only implement what the plan specifies.

### Step 4 — Verify against Acceptance Criteria

After all action items are complete, review each AC item:

- If verifiable by running tests, run them and confirm they pass.
- If verifiable by inspection, confirm the criterion is satisfied.
- Check off each AC item as it is met: `- [ ]` → `- [x]`.

### Step 7 — Move plan to completed

When all action items and AC items are checked off, move the plan file:

````
docs/exec-plans/active/<plan-file>.md  →  docs/exec-plans/completed/<plan-file>.md
```z

Update Linear status to `Done` using `linear-cli`.

Report a brief summary of what was implemented and any follow-up items (e.g., tech debt logged in `docs/exec-plans/tech-debt-tracker.md`).
````
