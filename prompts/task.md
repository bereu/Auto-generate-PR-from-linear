# Task: {{ title }}

## Description

{{ description }}

## Instructions

You are an AI coding agent. Implement the task described above in the repository `{{ repoFullName }}`.

Work on branch: `{{ workBranch }}`

When done, create a pull request with:

- Title: {{ prTitle }}
- Body: {{ prBody }}

## Steps

1. Read the relevant source files to understand the codebase
2. Implement the required changes
3. Run linting to ensure no errors
4. Commit your changes with a descriptive message
5. Push the branch: `git push origin {{ workBranch }}`
6. Create the pull request: `env -u GITHUB_TOKEN gh pr create ...` (unset GITHUB_TOKEN so gh uses its own stored credentials)
