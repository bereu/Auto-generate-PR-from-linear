---
name: qa-features-skills
description: Use this skill to ensure code quality by validating features against acceptance criteria, generating edge-case tests, and running verification suites.
version: 1.0.0
---

## Overview

This skill facilitates a thorough Quality Assurance process for new features or bug fixes. It focuses on translating high-level Acceptance Criteria (AC) into executable tests (using Vitest for unit/integration and Playwright for E2E) and identifying potential failure points that may have been overlooked during development.

## Core Activities

This skill drives feature implementation from a structured execution plan. It:

1. Reads the target exec plan
2. Reviews docs/INDEX.md and relevant source files to orient in the codebase
3. Implements each action item in the plan sequentially, marking [ ] as [x] when done
4. Adheres to project conventions from docs/DESIGN.md, docs/TECH_STACK.md, and docs/QUALITY_SCORE.md
5. Moves the completed plan file to docs/exec-plans/completed/ when all items are done

## Mandatory Rules

- **Environment Isolation**: Tests must never share state or interfere with a running production/dev environment.
- **Report Failures Clearly**: If a feature fails verification, provide a structured report of which AC failed and why.
