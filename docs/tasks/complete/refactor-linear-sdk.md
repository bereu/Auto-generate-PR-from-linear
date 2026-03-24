# Refactor: Replace raw GraphQL fetch with @linear/sdk

## Context

`src/linear.ts` currently calls the Linear GraphQL API using raw `fetch()` with
hand-written query strings. This is brittle and bypasses type safety. The official
`@linear/sdk` provides a fully-typed `LinearClient` that eliminates manual query
construction.

## Current State

```ts
// Manual GraphQL over fetch
async function gql<T>(q: string, variables = {}): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: process.env.LINEAR_API_KEY ?? "" },
    body: JSON.stringify({ query: q, variables }),
  });
  ...
}
```

## Target State

```ts
import { LinearClient } from "@linear/sdk";
const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
```

## Action Items

1. ✅ **Install dependency**

   ```
   vp add @linear/sdk
   ```

2. ✅ **Rewrite `src/linear.ts`**
   - Remove `gql()`, `headers()`, `GraphQLResponse` type, `LINEAR_API` constant
   - Instantiate `LinearClient` once (module-level singleton)
   - `fetchAgentIssues()` → `client.issues({ filter: { labels: { name: { eq: "agent" } }, state: { name: { eq: "Todo" } } } })`
   - `updateIssueState()`:
     - `client.issue(issueId)` → get `team`
     - `(await team.states()).nodes.find(s => s.name === stateName)`
     - `client.updateIssue(issueId, { stateId: state.id })`

3. ✅ **Run `vp lint`** — verify 0 errors

## Acceptance Criteria

- `src/linear.ts` contains no `fetch()` calls
- All exported functions (`fetchAgentIssues`, `updateIssueState`, `resolveRepo`) have identical signatures
- `vp lint` passes with 0 errors
