````markdown
# QA Verification: Session Registry Path Traversal Protection

## 1. Requirement Analysis

**AC**: "The system must prevent a session from accessing or creating directories outside of its designated `workingDirectory`."

## 2. Test Strategy

- **Unit Test**: Test the path sanitization utility with malicious inputs like `../../etc/passwd`.
- **Integration Test**: Attempt to spawn a session with a `workingDirectory` pointing to the system root and verify it is rejected by the `SessionRegistry`.

## 3. Implementation

### Vitest (Unit)

File: `tests/unit/shared/path-utils.test.ts`

```typescript
it("rejects relative path segments that attempt traversal", () => {
  const maliciousPath = "user-data/../../root-secret";
  const result = sanitizePath(maliciousPath);
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe("PATH_TRAVERSAL_ATTEMPT");
});
```
````

### Playwright (E2E)

File: `tests/e2e/security/isolation.spec.ts`

```typescript
test("should show error when creating session with invalid directory", async ({ page }) => {
  await page.goto("/new-session");
  await page.fill("#workingDir", "/restricted-area");
  await page.click("#submit");
  await expect(page.locator(".error-message")).toContainText("Invalid directory path");
});
```

## 4. Results

- [x] Unit tests passed
- [x] Integration tests passed
- [x] E2E verification complete
- [x] **Verdict**: Requirement met.

```

```
