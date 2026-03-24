# Refactor: Replace custom template engine with promptfoo SDK

## Context

`src/prompt-loader.ts` is a hand-rolled reimplementation of promptfoo's `{{variable}}`
template syntax. Using the actual `promptfoo` package ensures compatibility and removes
bespoke code to maintain.

## Current State

```ts
// Custom {{variable}} replacer
export function loadPrompt(name: string, vars: Record<string, string>): string {
  let template = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value ?? "");
  }
  const unresolved = [...template.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
  if (unresolved.length > 0) logger.warn(...);
  return template.trim();
}
```

## Target State

Use `promptfoo`'s built-in render utility to handle template interpolation:

```ts
import { render } from "promptfoo";

export function loadPrompt(name: string, vars: Record<string, string>): string {
  const template = fs.readFileSync(filePath, "utf-8");
  return render(template, vars);
}
```

## Action Items

1. ✅ **Research promptfoo render API**
   - Check `promptfoo` package exports for template rendering function
   - Confirm it handles `{{variable}}` syntax and unresolved variable behavior

2. ✅ **Install dependency**

   ```
   vp add promptfoo
   ```

3. ✅ **Rewrite `src/prompt-loader.ts`**
   - Replace manual `replaceAll` loop with promptfoo render call
   - Remove manual unresolved variable detection (if promptfoo handles it)
   - Keep file path resolution logic (`PROMPTS_DIR`) unchanged

4. ✅ **Run `vp lint`** — verify 0 errors

## Acceptance Criteria

- `src/prompt-loader.ts` contains no manual `{{...}}` string replacement logic
- `loadPrompt()` retains identical signature: `(name: string, vars: Record<string, string>) => string`
- `vp lint` passes with 0 errors
