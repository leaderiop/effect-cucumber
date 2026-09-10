---
"@effect-cucumber/vitest": minor
---

Adds `GherkinJUnitReporter`, an optional vitest `Reporter` that writes JUnit XML with Scenario tags
as `<properties>` and `attach()`'s output as `<system-out>` — the two things vitest's own built-in
`--reporter=junit` (already usable today, with zero changes from this package) has no configuration
hook to add. Register it alongside your existing reporters:

```ts
import { GherkinJUnitReporter } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { reporters: ["default", new GherkinJUnitReporter({ outputFile: "junit.xml" })] }
})
```

This closes the gap for Allure, ReportPortal, Jenkins, GitLab, and other JUnit-XML-consuming tools
that want tags and attached evidence, not just pass/fail. See ADR-EC-060.
