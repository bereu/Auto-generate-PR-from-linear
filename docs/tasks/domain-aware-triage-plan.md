# Plan — Domain-aware Bug Triage (minimal doc reading)

## Goal

Let the bug-triage flow consult the DDD domain docs in `docs/domain/*` so both
(a) clarifying-question evaluation and (b) complexity assessment are domain-aware.
Reading must be **minimal**: the agent reads a lightweight **manifest index first**,
then reads only the relevant bounded-context doc(s) via **agent tools** — never all files.

## Decisions (confirmed with user)

- **Where:** both stages — `EvaluateBugReportQuery` (completeness) and `assessComplexityStep` (complexity).
- **Mechanism:** agentic — Mastra tools `listDomainDocs` + `readDomainDoc`; the LLM decides which docs to read.
- **Index:** a manifest file `docs/domain/index.json` (with a header-parse fallback if it's missing).

## Constraints observed

- `docs/domain/` is auto-generated + gitignored → so is `index.json`. A generator script (re)builds it; the reader self-heals by parsing doc headers if the manifest is absent (BE-003 graceful-degrade).
- ARCH-001: workflow steps delegate LLM/business logic to Query/Command; all prompts go through the Langfuse fetch-with-local-fallback util under a `LANGFUSE_PROMPT_NAMES` name.
- BE-001: filesystem access is a Repository concern, not inlined in a step/agent.
- BE-003: doc-read failures are logged and degrade to "no domain context" — triage never blocks.
- BE-004: new business logic gets unit tests.
- GEN-001: no magic strings — paths/names in constants.

## Changes

### 1. Constants (`src/slack-bug-intake/slack-bug-intake.constants.ts`)

- Add `DOMAIN_DOCS_DIR = "docs/domain"` and `DOMAIN_DOCS_MANIFEST = "index.json"`.
- Update `TRIAGE_SYSTEM_PROMPT` and `COMPLEXITY_SYSTEM_PROMPT` local fallbacks to instruct:
  "First call `listDomainDocs`. Read at most the 1–2 most relevant bounded-context docs
  via `readDomainDoc` before deciding. Do not read docs that aren't relevant."

### 2. Domain-docs repository (`src/slack-bug-intake/domain-docs/domain-docs.repository.ts`)

- `@Injectable` reader over the filesystem:
  - `listManifest(): Promise<DomainDocMeta[]>` — read `docs/domain/index.json`; if missing/invalid, scan `*.md`, parse `# Domain Model — …` H1 + `**Bounded Context:**` line to synthesize the index.
  - `readDoc(name): Promise<string>` — read a single doc. **Path-traversal guard:** only names present in the manifest/whitelist under `DOMAIN_DOCS_DIR` are readable.
- All errors caught → logged via `logger` util, return empty list / null (BE-003).
- `DomainDocMeta = { name, title, boundedContext, summary?, keywords? }`.

### 3. Agent tools (`src/slack-bug-intake/agent/domain-docs.tools.ts`)

- Mastra `createTool` × 2 delegating to the repository:
  - `listDomainDocs` — no input; returns the index (name/title/boundedContext/keywords) — cheap.
  - `readDomainDoc` — input `{ name }`; returns doc body.
- Repository instantiated/injected for tool `execute`.

### 4. Wire tools into both stages

- `bug-triage.agent.ts`: add `tools: { listDomainDocs, readDomainDoc }` to `bugTriageAgent` → covers `EvaluateBugReportQuery`.
- `bug-triage.workflow.ts` `assessComplexityStep`: replace inline `generateObject` with a tool-capable **complexity agent** (new Mastra `Agent` with the same tools + `structuredOutput: DifficultySchema`, prompt via `langfuse.fetchComplexityPrompt`). Keeps the step orchestrating + BE-003 fallback to `FALLBACK_DIFFICULTY` on failure.
  - Add `AGENT_NAMES.complexity` to `src/constants/mastra.constants.ts`.

### 5. Manifest generator

- `scripts/generate-domain-index.ts` — scans `docs/domain/*.md`, extracts title/bounded-context/summary/keywords, writes `docs/domain/index.json`.
- Add `npm run gen:domain-index` to `package.json`.

### 6. Langfuse

- Reuse existing `LANGFUSE_PROMPT_NAMES.bugTriage` and `.complexity`; only the local fallback templates change (step 1). No new prompt names needed.

### 7. Tests (BE-004)

- `domain-docs.tools.test.ts`: tools return repository output; list is cheap; read enforces whitelist.
- Update `evaluate-bug-report.query.test.ts` to tolerate the tool-enabled agent (mock tools).

## Validation

- `npm run lint`, `npm run test`, then `archgate check`.
- Invoke `@architect` then `@quality-manager` skills (initial task completion).

## Out of scope

- Generating the domain docs themselves (already added by user).
- Vector/embedding retrieval — keyword-agentic selection is enough for "minimum reading".
