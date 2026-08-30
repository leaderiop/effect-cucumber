# Security Audit — Phase 02: loadFeature, Parse, Compile, Correlate

**Audited:** 2026-08-28
**ASVS Level:** 1
**block_on:** high
**Threat register source:** `<threat_model>` blocks in `02-01-PLAN.md` … `02-11-PLAN.md` (11 plans, 46 mentions, 30 distinct threat IDs)
**Result:** SECURED — 30/30 threat IDs resolved. 0 blockers. 2 non-blocking residual observations.

> **Method.** Every `mitigate` row was verified by locating the mitigation in committed
> implementation code (file:line), not by reading the plan or summary prose. Every `accept` row is
> logged below. Implementation files were not modified by this audit; the working tree was clean
> before and after.

---

## 1. Note on threat-ID collisions

Two IDs are reused across plans for genuinely different threats. They are audited separately:

| ID | Plan | Threat |
|----|------|--------|
| T-02-05a | 02-01 | Tampering — `pnpm-lock.yaml` drift |
| T-02-05b | 02-04 | Input Validation (V5) — `.feature` content parsing delegated upstream |
| T-02-06a | 02-01 | Elevation of Privilege — version-pinning bypass (literal semver) |
| T-02-06b | 02-09 | Tampering — `packageName` / `PackageName` removal breaking cross-package build |

Counted as 30 distinct IDs / 32 verification rows.

---

## 2. Threat verification — `mitigate`

| Threat ID | Category | Status | Evidence (verified in code) |
|-----------|----------|--------|------------------------------|
| T-02-SC | Tampering (supply chain) | CLOSED | Blocking human-verify gate ran before install (`02-01-SUMMARY.md:68` records explicit developer approval; neither `vitest` nor `@types/node` declares `postinstall`). No dependency added by plans 02-10/02-11. `--frozen-lockfile` present on all four CI installs: `.github/workflows/check.yml:31,49,78,91`. |
| T-02-01 | Denial of Service (ReDoS) | CLOSED | `grep -rn "new RegExp" packages --include=*.ts` → **0 matches**. `grep -rn "eval(" packages/gherkin/src` → 0. Exactly one regex exists in the package: `packages/gherkin/src/Validate.ts:280` `const PLACEHOLDER = /<([^<>]+)>/g` — a module-scope **fixed literal**, matched *against* feature text at `Validate.ts:320` via `content.matchAll(PLACEHOLDER)`. Inner class `[^<>]` excludes both delimiters, so no nested-quantifier backtracking path exists. `matchAll` is spec-required to clone the regex, so the `/g` flag carries no `lastIndex` state across calls. No `RegExp` in `Errors.ts`, `Model.ts`, `Correlate.ts`, `Parser.ts`, `Source.ts`, `Pickles.ts`, `loadFeature.ts`, `index.ts`. |
| T-02-04 | Denial of Service (cascading errors) | CLOSED | `packages/gherkin/src/Parser.ts:76-81` — `collectErrors` returns `thrown.errors ?? [thrown]` behind an `instanceof Errors.GherkinException` guard, plus an `instanceof Error` fallback, so neither upstream error shape can raise a `TypeError` inside the catch block. Output is bounded at `Parser.ts:106-121` (`describeParseFailure`): first error in full, remainder collapsed to a count plus line numbers. |
| T-02-05a | Tampering (lockfile) | CLOSED | `pnpm-lock.yaml` committed at repo root and carries the catalog entries (`@types/node` at `pnpm-lock.yaml:12,69`). `pnpm install --frozen-lockfile` in every CI job that installs: `check.yml:31,49,78,91` and `snapshot.yml:31`. |
| T-02-05b | Input Validation (V5) | CLOSED | 100% of lexing/parsing delegated to `@cucumber/gherkin`: `Parser.ts:133` constructs `new GherkinParser(new AstBuilder(newId), new GherkinClassicTokenMatcher())`. No `new RegExp`, no `eval`, no custom lexer anywhere under `packages/gherkin/src` (greps above). |
| T-02-06a | Elevation of Privilege (pin bypass) | CLOSED | `packages/gherkin/package.json` `devDependencies` = `{"vitest": "catalog:", "@types/node": "catalog:"}` — exactly two `catalog:` references, neither `catalog:peer`, no literal semver for either package. Both resolve through `pnpm-workspace.yaml`'s default catalog (`vitest: ^4.1.0`, `@types/node: ^26.4.0`). *Scope note:* this threat covers the two entries plan 02-01 introduced. The pre-existing `@cucumber/*` runtime `dependencies` carry literal ranges and are outside this threat's declared scope (they are not catalog-managed in `pnpm-workspace.yaml`, whose catalog is documented as dev/peer pins only). |
| T-02-06b | Tampering (build-graph exports) | CLOSED | `packages/gherkin/src/index.ts:49-51` — `export const packageName = "@effect-cucumber/gherkin" as const` and `export type PackageName = typeof packageName`, both present verbatim with the rationale comment naming `packages/vitest/src/index.ts` as the consumer. |
| T-02-07 | Spoofing (error-class identity) | CLOSED | `packages/gherkin/src/Errors.ts:77` — `this.name = "LoadFeatureError"` assigned explicitly in the constructor. Pinned at runtime: `packages/gherkin/test/Contracts.test.ts:39-41` asserts `makeError().name === "LoadFeatureError"`. Consumers discriminate on `reason` / `_tag` / `instanceof`; `grep -rn "\.name ===" packages/gherkin/src` → **0 matches**. |
| T-02-09 | Tampering (`@REQ-EC-NNN` namespace) | CLOSED | `grep -rln "@REQ-EC" --include="*.feature" .` → **0 fixture files**. The only occurrence repo-wide under the fixture tree is the prohibition itself in `packages/gherkin/test/fixtures/README.md:23`. `bash spec/scripts/verify-traceability.sh` executed during this audit: check 4 reports `SKIP — no .feature tags yet`, exit 0. `pnpm verify:spec` is a CI step at `check.yml:102`. |
| T-02-10 | Repudiation (upstream drift) | CLOSED | `packages/gherkin/test/upstream-pin.test.ts` exists and pins `@cucumber/gherkin@42.0.1` behavior per fixture (header at line 2; ~25 named cases across `fixture table`, `silently zero or silently wrong compile() output`, `parse-time throws`, `silently wrong but only heuristically detectable`). Installed version confirmed `@cucumber+gherkin@42.0.1` in `node_modules/.pnpm`. `upstream-pin.test.ts:273` explicitly pins that every gherkin error class reports `.name === "Error"`. |
| T-02-11 | Spoofing (error-class discrimination) | CLOSED | `Parser.ts:138` routes on `first instanceof Errors.NoSuchLanguageException`; `Parser.ts:77,91` use `instanceof Errors.GherkinException`. `grep -rn "\.name ===\|\.name ==" packages/gherkin/src` → **0 matches**, so no `.name`-based routing exists anywhere in `src/`. |
| T-02-12 | Tampering (`dialects[language]`) | CLOSED (residual R-02, informational) | `Correlate.ts:151` `const dialectOf = (language: string): Dialect \| undefined => dialects[language]`; both call sites narrow explicitly before use — `Correlate.ts:162-163` and `172-173`: `return dialect === undefined ? false : dialect.<kind>.includes(keyword.trim())`. Unknown languages answer `false` rather than throwing. Upstream pre-rejection confirmed empirically: a `# language: constructor` header is rejected inside `@cucumber/gherkin` and surfaces as `LoadFeatureError` `reason: "ParseFailed"` before `Correlate.ts` runs. See residual R-02. |
| T-02-13 | Spoofing (unresolvable `astNodeIds[0]`) | CLOSED | `Correlate.ts:359-372` — `resolveStep` looks up `byStepId.get(sourceId)` and, on a miss, `throw new LoadFeatureError({...})` at `Correlate.ts:367` with `reason: "ParseFailed"`. No fallback keyword or origin. Reached from the only step-mapping site, `Correlate.ts:425`: `steps: pickle.steps.map((pickleStep) => resolveStep(pickleStep, index.byStepId, uri))` — all pickle steps go through it. |
| T-02-14 | Spoofing (node-id collision) | CLOSED | `loadFeature.ts:76` — `const newId = IdGenerator.uuid()`, constructed once per call and passed to both `parseDocument` (`loadFeature.ts:77`) and `compilePickles` (`loadFeature.ts:78`). `IdGenerator.incrementing` appears nowhere in `src/`. Regression pins: `Correlate.test.ts:313-350` — three F23 tests asserting a duplicate-free union across two Features, disjoint id sets, and different ids for two correlations of identical source. |
| T-02-15 | Tampering (`PickleStepArgument` scope creep) | CLOSED | `Correlate.test.ts:381-392` — F25 iterates `["hashes", "raw", "rowsHash"]` and asserts the argument carries no such method. |
| T-02-16 | Repudiation (silent-wrong `compile()`) | CLOSED | All 10 `LoadFeatureErrorReason` members are raised from `Validate.ts` / `Parser.ts` / `Source.ts` (`Validate.ts:92,111,132,167,170,239,405`; `Parser.ts:141,149,161`; `Source.ts:64`), each with `uri` and, where locatable, `line`. Every one of the 10 reasons is asserted by at least one test: `Parser.test.ts:55,67,78,87,94,108,115,184`; `Validate.test.ts:104,108,112,116,120,124,140,190,259,361`; `Contracts.test.ts:52,61,131`. |
| T-02-17 | Tampering (dead-work reintroduction) | CLOSED | `Validate.ts:27-31` records the verified refutation of PITFALLS.md Pitfall 30 in the module doc comment, naming the grammar production `Feature := header Background? ScenarioDefinition* Rule*` and marking it `[VERIFIED]`. Pinned by fixture `parse-failed-background-after-rule.feature` (`upstream-pin.test.ts:263`). |
| T-02-18 | Repudiation (over-broad placeholder detection) | CLOSED | The three verified-legitimate texts are explicit negative controls: `Validate.test.ts:317-319` — `"the assertion 2 < 3 holds"`, `"the html is <div>hello</div>"`, `"an email <a@b.com>"`, documented as D4 negative controls at `Validate.test.ts:26`. A regression to a bare `/<[^>]*>/` fails these by name. |
| T-02-19 | Repudiation (silently dropped Examples column) | CLOSED | `Validate.ts:446-467` — `unknownPlaceholder` emits `reason: "UnknownPlaceholder"` whose message names the columns that DO exist (`which declares: ${Array.from(columns).join(", ")}`) and cites the upstream trailing-`\|` cause. Carried on `ParsedFeature.warnings` (`Validate.ts:117` pushes it onto the returned array), not thrown. Asserted at `Validate.test.ts:361` and `Contracts.test.ts:131`. |
| T-02-20 | Elevation of Privilege (runner/Effect reachability) | CLOSED | `scripts/verify-no-runner-dep.sh` — comment-stripped scan of real import specifiers (`IMPORT_RE` matches only `from`/`import`/`require` positions) over `packages/gherkin/src/**/*.ts`, plus a `node -e` + `JSON.parse` manifest assertion over `dependencies` and `peerDependencies`. Executed during this audit: exit 0, three ✓ lines (positive control found 3 files importing `@cucumber/gherkin`). Wired as root script `verify:no-runner-dep` and CI step `check.yml:101`. `loadFeature.ts` composes only local modules plus `@cucumber/messages`. |
| T-02-21 | Information Disclosure (API surface) | CLOSED | `packages/gherkin/src/index.ts` exports only `loadFeature`, `parseFeature`, `LoadFeatureError`, the error/warning types, the `Model.ts` types, and the two build-graph exports. `Parser`, `Pickles`, `Correlate`, `Source`, `Validate` are **not** exported (stated at `index.ts:13-15` and verified against the export statements at `index.ts:22-51`). `packages/gherkin/package.json` `exports` has exactly two keys (`"."` and `"./package.json"`); `publishConfig.exports` mirrors them — no subpath. |
| T-02-22 | Tampering (`dependencies` gaining `effect`) | CLOSED | `scripts/verify-no-runner-dep.sh` assertion 3 parses the manifest with `node -e` + `JSON.parse` (never grep) and inspects `dependencies` and `peerDependencies` only, deliberately excluding the legitimately-present `devDependencies.vitest` — the exclusion is documented in the script's METHOD NOTE. Current manifest state confirmed clean by running the gate. |
| T-02-23 | Repudiation (vacuous gate) | CLOSED | Assertion 1 is a positive control (`verify-no-runner-dep.sh`: fails if zero `@cucumber/gherkin` imports are found) plus preconditions that fail on a missing dir, missing manifest, or empty file list. Six mutation results recorded in `02-10-SUMMARY.md:89-98` (a–f), including the two must-not-fail controls (d: real `devDependencies.vitest` → exit 0; f: commented imports → exit 0). `git status --porcelain packages/gherkin/src` empty after every revert. |
| T-02-24 | Tampering (type errors in test files) | CLOSED | `packages/gherkin/tsconfig.test.json` exists — `noEmit: true`, `composite: false`, `include: ["src", "test"]`, outside the `tsc -b` solution. Root script `typecheck:test` = `tsc --noEmit -p packages/gherkin/tsconfig.test.json`. Wired into the `types` CI job at `check.yml:55`. Non-vacuity proven at `02-10-SUMMARY.md:100-101` (deliberate `const deliberateTypeError: number = "not a number"` caught, then reverted). |
| T-02-25 | Repudiation (CI/local divergence) | CLOSED (residual R-01) | Cross-check re-executed during this audit: all **10** `- run: pnpm <x>` steps in `check.yml` (lines 32,37,50,55,59,79,93,94,101,102) map to keys in the root `package.json` `scripts` object; no inline CI-only command exists. See residual R-01 — this is a point-in-time assertion, not a committed recurring gate. |
| T-02-26 | Repudiation (ADR-EC-014 prescribes a wrong check) | CLOSED | `spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md:133-157` — a second `> **Correction (2026-08-28, Phase 2 implementation, verified against …)**` blockquote naming all three verified false positives (`the assertion 2 < 3 holds`, `the html is <div>hello</div>`, `an email <a@b.com>`, lines 141-142) and both extra scan carriers (**DataTable cell values** and **DocString content**, lines 146-147), and describing the two-check column-aware form actually implemented (line 157). |
| T-02-27 | Repudiation (untrue status claims) | CLOSED | `spec/roadmap.md:5-21` — Current state now reads "`@effect-cucumber/gherkin`'s parse pipeline has shipped; `@effect-cucumber/vitest` is still scaffolding", and the gates table states `@effect-cucumber/gherkin` has real source while `@effect-cucumber/vitest` is still a placeholder barrel. No stale "both are placeholders" claim remains. |
| T-02-28 | Tampering (traceability drift) | CLOSED | `bash spec/scripts/verify-traceability.sh` executed during this audit: **PASS 7 / FAIL 0 / SKIP 1**, including both directions of the behaviors and decisions registry↔disk checks and 160 relative links resolving with none gitignored. Wired as root script `verify:spec` and CI step `check.yml:102`. |
| T-02-29 | Tampering (`REQ-EC` namespace collision) | CLOSED | Same run: check 4 reports `SKIP — no .feature tags yet` (clean skip, not a failure). No `@REQ-EC-NNN` tag on any `.feature` file repo-wide. |

---

## 3. Accepted risks log

These threats were dispositioned **`accept`** in the phase threat model. They are recorded here as
the register requires, with the implemented behavior verified to match the accepted design. They
are **not** defects and must not be "fixed" without reopening the decision.

### AR-01 — T-02-02: Error and warning messages carry FULL author content, never truncated

**Category:** Information Disclosure
**Dispositioned:** `accept` in plans 02-02, 02-04, 02-05, 02-07, 02-08, 02-09
**Decision status:** LOCKED developer decision. It deliberately overrides the phase researcher's
truncate-by-default recommendation (RESEARCH Assumption A7).

**Accepted exposure.** `LoadFeatureError.message` and `LoadFeatureWarning.message` reproduce
`.feature` file content verbatim — step text, Scenario/Background `description` bodies, DataTable
cell values, DocString bodies, and upstream parse-error text. Because `loadFeature` is called at
module top level, a throw becomes a vitest **collection error** whose single message is printed in
full. A feature file containing fixture credentials will therefore reproduce those credentials in
error output that may reach a publicly readable CI log.

**Why accepted.** The description is exactly where a swallowed leading-typo step lands, and a
DocString/DataTable cell is exactly where an uninterpolated placeholder hides; quoting them in full
is what makes this phase's most confusing failures self-explaining. Usefulness was chosen over
redaction.

**Verified as designed (this is the intended behavior, confirmed present):**
- Policy recorded in the module doc comment at `packages/gherkin/src/Errors.ts:22-30`, including the
  explicit "Do not silently re-introduce a truncation step, an ellipsis, a maximum-length constant,
  or a slice of message content."
- `grep -rn "slice(0,\|substring(0,\|substr(\|MAX_LEN\|maxLength\|…" packages/gherkin/src` → **0 matches**.
- Regression pins against silent reintroduction: `Contracts.test.ts:96` (`message.includes("…")` is
  `false`) and `Validate.test.ts:197-198,252-253` (`not.toContain("…")` and `not.toContain("...")`).
- The one place content is bounded is `Parser.ts:106-121`, which collapses only the **count** of
  cascading consequence errors plus their line numbers — no individual error's own text is truncated.

**Residual risk owner:** the feature-file author. **Mitigation available to consumers:** do not put
real secrets in `.feature` files; use fixture placeholders.

---

### AR-02 — T-02-03: `readFeatureSource(path)` / `loadFeature(path)` perform no path sanitization

**Category:** Tampering (path traversal)
**Dispositioned:** `accept` in plans 02-04 and 02-09

**Accepted exposure.** The path argument is taken verbatim: no `path.resolve`, no `normalize`, no
`realpath`, no containment/allow-list check. `loadFeature("../../etc/passwd")` will attempt that
read.

**Why accepted.** No privilege boundary is crossed. The caller already chose the path and already
runs in their own process with their own filesystem permissions; a traversal guard would be
security theatre that adds no capability restriction. Path sanitization is explicitly **forbidden**
by an acceptance criterion in plan 02-04 so it cannot be re-added by reflex.

**Verified as designed (absence of sanitization is the requirement):**
- `grep -rn "resolve(\|normalize(\|realpath\|node:path" packages/gherkin/src` → **0 matches**.
- Rationale recorded in the module doc comment at `packages/gherkin/src/Source.ts:16-19`, naming
  threat T-02-03 and its `accept` disposition.
- `Source.ts:59-70` — `fs.readFileSync(path, "utf8")` with every filesystem failure normalised into
  `LoadFeatureError` `reason: "MissingFile"`, so a raw Node `ENOENT` never escapes the package.
- `Source.ts:21` is the only `node:fs` import under `src/`, confining the package's filesystem reach
  to one file.

**Scope condition that must hold for this acceptance to remain valid:** `loadFeature` is a
build/test-time developer API called from the developer's own test files. If a future phase ever
exposes `loadFeature` to a path supplied by an untrusted party (an HTTP request, a CLI argument
from a lower-privileged actor, a hosted runner accepting user feature files), **this acceptance is
void and T-02-03 must be reopened.**

---

### AR-03 — T-02-08: Fixture corpus fed to the parser is not resource-bounded

**Category:** Denial of Service
**Dispositioned:** `accept` in plan 02-03

**Accepted exposure.** No timeout, size cap, or recursion bound is applied around
`@cucumber/gherkin`'s parse of a `.feature` file. A pathological file could in principle consume
build time.

**Why accepted.** Every fixture is a hand-written file of a few lines under this repository's own
control; no untrusted third-party feature file is parsed at build time. The upstream parser
additionally hard-stops after roughly 10 collected errors, bounding the cascading-error case.

**Verified as designed:**
- `packages/gherkin/test/fixtures/` contains only repo-authored fixtures.
- The cascading-error bound is exercised and pinned by
  `upstream-pin.test.ts:232` (`parse-failed-misplaced-tag.feature` collects several errors) and the
  output is collapsed by `Parser.ts:106-121`.

**Same scope condition as AR-02:** valid only while the parsed corpus is repo-controlled.

---

## 4. Unregistered flags

**None.**

All 11 `## Threat Flags` sections (`02-01-SUMMARY.md` … `02-11-SUMMARY.md`) declare `None`.
Independently checked the phase's actual new attack surface against the register:

| New surface introduced this phase | Mapped to |
|-----------------------------------|-----------|
| `fs.readFileSync` in `Source.ts` (only filesystem access in the package) | T-02-03 (accept) |
| One regex literal in `Validate.ts` | T-02-01 (mitigate) |
| Public barrel `index.ts` / package `exports` | T-02-21 (mitigate) |
| `scripts/verify-no-runner-dep.sh`, `tsconfig.test.json`, two new CI steps | T-02-20 / T-02-22 / T-02-23 / T-02-24 / T-02-25 |
| Two new devDependencies (`vitest`, `@types/node`) | T-02-SC / T-02-06a |

No network endpoint, no authentication or authorization path, no deserialization of untrusted data,
no schema at a trust boundary, and no cryptographic primitive was introduced by this phase.

---

## 5. Residual observations (non-blocking, WARNING severity)

Neither meets the `block_on: high` threshold. Both are recorded so they are not rediscovered as
"new" findings later.

### R-01 — T-02-25's cross-check is a point-in-time assertion, not a committed recurring gate

The declared mitigation reads *"Automated cross-check asserting every `- run: pnpm <x>` in
`check.yml` corresponds to a root `package.json` script."* The check exists only as an
`<automated>` verify command inside `02-10-PLAN.md:285`. There is **no** committed script
(`ls scripts/` → `verify-no-runner-dep.sh`, `verify-oxlint-plugin.sh`, `verify-pack.sh`,
`verify-tsgo-gate.sh` — none performs this cross-check) and **no** CI step that re-runs it.

- **Asserted state is currently true.** Re-executed during this audit: 10/10 CI `pnpm` steps map to
  root scripts. The threat is closed *as of this commit*.
- **Residual.** A future PR adding an inline CI-only command, or renaming a root script without
  updating `check.yml`, will not be caught. The threat is Repudiation-class (process drift), not
  exploitable, hence non-blocking at ASVS L1 with `block_on: high`.
- **If hardened later:** promote the `node -e` one-liner from `02-10-PLAN.md:285` to
  `scripts/verify-ci-scripts.sh`, add a root `verify:ci-scripts` script, and add it to the `package`
  job — filtering out `install` as the plan's own verify command had to (see `02-10-SUMMARY.md:132-135`).

### R-02 — `dialectOf` reads through `Object.prototype`; unreachable in the current pipeline

`Correlate.ts:151` is a bare bracket index (`dialects[language]`) with no `Object.hasOwn` guard and
no null-prototype record. `@cucumber/gherkin`'s exported `dialects` object has `Object.prototype` as
its prototype (verified empirically during this audit), so `dialectOf("constructor")` returns a
`Function` rather than `undefined`; the `dialect === undefined` narrowing at `Correlate.ts:162,172`
would then pass and `dialect.scenarioOutline.includes(...)` would throw a `TypeError`.

The declared mitigation text claims the code answers `false` "rather than throwing or reading a
prototype property." That claim is not literally true of `dialectOf` in isolation.

- **Not reachable.** The only input to `dialectOf` is `document.feature.language`, which originates
  in `@cucumber/gherkin`'s own parse. Verified end to end during this audit: a
  `# language: constructor` header fails inside the upstream parser and surfaces as
  `LoadFeatureError` `reason: "ParseFailed"` ("keywords is not iterable") from `Parser.ts:147`,
  before `Correlate.ts` is ever entered. The register's own stated precondition — "an unknown
  `# language:` header has already been rejected in `Parser.ts` before this point" — therefore holds
  in practice, though the rejection arrives as `ParseFailed` rather than `UnknownDialect`.
- **Worst case if the precondition were ever broken:** an in-process `TypeError` on a
  developer-authored file. No privilege boundary, no data exposure, no remote reachability.
- **If hardened later:** `Object.hasOwn(dialects, language) ? dialects[language] : undefined` at
  `Correlate.ts:151` closes it in one line with no behavior change for real dialects.

### Cross-reference: code-review warning WR-01

`02-REVIEW.md:65-99` records that `validateFeature` runs its Group A loop to completion before the
placeholder loop starts, so the first error thrown is not always the earliest in document order.
This is a **correctness** finding, not a security-mitigation gap: T-02-16's declared mitigation is
that each row raises a *distinct, named, located* `LoadFeatureError` with a per-reason test, and all
10 reasons plus their tests are present. Nothing is silently passed as a result of the ordering. It
is noted here only so the two reports do not appear to contradict each other.

---

## 6. Audit hygiene

- No implementation file was created, modified, or deleted by this audit.
- `git status --porcelain` was empty before the audit; the only new file is this document.
- Commands executed were read-only or idempotent verification scripts:
  `bash scripts/verify-no-runner-dep.sh` (exit 0),
  `bash spec/scripts/verify-traceability.sh` (PASS 7 / FAIL 0 / SKIP 1),
  the `check.yml`↔`package.json` cross-check (exit 0, 10 steps),
  and read-only greps plus two `node --input-type=module` probes that imported
  `@cucumber/gherkin` and `parseFeature` without writing anything.
