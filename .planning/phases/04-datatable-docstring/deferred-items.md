# Deferred items — Phase 04 (datatable-docstring)

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

## `pnpm verify:pack` enforces ADR-EC-015, which ADR-EC-021 superseded

**Found during:** plan 04-04, Task 3 (the first plan in Phase 4 to run this gate).

**Symptom:**

```
✗ @effect-cucumber/gherkin declares effect in devDependencies, peerDependencies -- ADR-EC-015: this package parses feature files and must never depend on effect.

✗ pack shape: BROKEN
```

**Why it is out of scope:** the check lives at `scripts/verify-pack.sh:130-139` and reads
`packages/gherkin/package.json` only. That manifest was last modified by `f5d84eb`
("effect becomes a peer dependency"), which implemented
[ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
— an ADR whose title states outright that it **supersedes ADR-EC-015**. The gate has been red
since that commit; plan 04-04 changed no manifest at all
(`git diff 6ecadab HEAD --name-only` lists five files, none of them a `package.json`), so it
neither caused nor can cause this failure.

The other four assertions in the same gate pass, including the two this plan actually bears on:
`exports["."] -> ./dist/index.js (publishConfig.exports applied)` and
`no catalog: or workspace: protocol left in any dependency field`.

**What the fix is (for whoever picks it up):** update the ADR-EC-015 block in
`scripts/verify-pack.sh` to the ADR-EC-021 rule — `effect` in `peerDependencies` and
`devDependencies` is now CORRECT and required; what must stay forbidden is `effect` in
`dependencies`, and any concrete `@effect/platform-*` implementation outside `devDependencies`.
The ADR's own amendment note (line 68) states that shape precisely.

**Not** a Phase 4 concern: it is a spec-reconciliation item, and Phase 4's own reconciliation plan
(04-05) is the natural home for it, since that plan already owns carrying ADR-EC-008's corrections
into `spec/`.
