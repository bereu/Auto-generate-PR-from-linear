---
name: run-regression-testing
description: this skill for regression testing, To check main user story is working or not.
version: 1.1.0
---

# Test case

## Positive

1. User mention to bot
2. Agent discuss with user until get enough information
3. create linear ticket

## Sample Error report

- User cannot login with SSO
- They use entra ID of Azure

## CLI

**preconditions**
linear and GitHub tokens are already configured.

**command**
run local: `npm run dev:local`
linear: `linear-cli -h`
github: `gh -h`
