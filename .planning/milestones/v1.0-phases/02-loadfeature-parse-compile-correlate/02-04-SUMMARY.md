---
phase: 02-loadfeature-parse-compile-correlate
plan: 04
subsystem: gherkin-parsing
tags: [gherkin, cucumber, parser, pickles, error-handling, node-fs, vitest]

# Dependency graph
requires:
  - phase: 02-01
    provides: "@types/node as a devDependency and types:[node] in packages/gherkin/tsconfig.json — without both, node:fs does not resolve under the workspace-wide types:[] base"
  - phase: 02-02
    provides: "packages/gherkin/src/Errors.ts — the LoadFeatureError class and the LoadFeatureErrorReason union every throw site here selects from"
  - phase: 02-03
    provides: "the 28-file fixture corpus and the verified fact that Errors.UnexpectedTokenException does not exist in @cucumber/gherkin@42.0.1"
provides:
  - "packages/gherkin/src/Source.ts — readFeatureSource(path) => string, the ONLY node:fs consumer in the package"
  - "packages/gherkin/src/Parser.ts — parseDocument(source, uri, newId) => GherkinDocument with every upstream throw wrapped as MissingFile-free ParseFailed / UnknownDialect / NoFeature"
  - "packages/gherkin/src/Pickles.ts — compilePickles(document, uri, newId) => ReadonlyArray<Pickle>, a pass-through over compile() sharing the caller's id generator"
  - "packages/gherkin/test/Parser.test.ts — 10 tests, one per Group B reason tag plus a positive control and a mutation-tested Pitfall P5 guard"
affects: [02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-shape error normalisation via the cucumber-js idiom `errors ?? [thrown]`, gated on instanceof Errors.GherkinException"
    - "Error-class discrimination by instanceof only; the name property is never read"
    - "The parse-error line is read off the FIRST collected error, never off the composite whose own location is undefined"
    - "Cascading consequences collapse to a count plus line numbers; no individual upstream message is ever truncated"
    - "A local loadFeatureError() helper picks between two constructor shapes because exactOptionalPropertyTypes makes `line: undefined` and an omitted `line` different types"
    - "Caught unknown values narrowed by `in`-operator type guards, never by casts"
    - "Mutation testing as a task verify: each load-bearing line is broken on purpose and the test suite must go red"

key-files:
  created:
    - packages/gherkin/src/Source.ts
    - packages/gherkin/src/Parser.ts
    - packages/gherkin/src/Pickles.ts
    - packages/gherkin/test/Parser.test.ts
  modified: []

key-decisions:
  - "The Pitfall P5 bare-exception shape is driven through parseDocument by spying on GherkinParser.prototype.parse with a genuine upstream exception captured under stopAtFirstError=true, rather than by widening parseDocument's signature with a stopAtFirstError option it would otherwise never need"
  - "collectErrors is gated on `instanceof Errors.GherkinException` before reading `.errors`, so a non-gherkin throw can never be mistaken for a composite by duck-typing an unrelated `.errors` property"
  - "Errors.UnexpectedTokenException is never referenced; it is unreachable by name in @cucumber/gherkin@42.0.1 and needs no special case, since everything that is not a NoSuchLanguageException falls through to ParseFailed"
  - "No path sanitisation in Source.ts (threat T-02-03 dispositioned accept), enforced by an acceptance criterion that resolve( / normalize( / .. never appear in the file"
  - "REQUIREMENTS.md is left untouched: PARSE-01 and PARSE-03 are not deliverable until loadFeature.ts and Validate.ts land in later plans of this phase"

patterns-established:
  - "Every module doc comment states the module's role AND the reasoning behind a non-obvious choice, including choices made by omission (GherkinInMarkdownTokenMatcher, the absent path guard, the absent Pitfall-30 walk check)"
  - "Tests assert err.reason, never message text — the one exception is the collapsed-consequence count, which IS the behavior under test"
  - "A positive control accompanies every suite of negative assertions, so an implementation that rejects everything cannot pass"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-08-28
---

# Phase 02 Plan 04: Source, Parser, and Pickles Summary

**The three input-side modules — read bytes, parse them, compile pickles — with every Node `ENOENT` and every `@cucumber/gherkin` exception normalised into a `LoadFeatureError` carrying one of four distinct reason tags, and a mutation-tested suite proving each one.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-28T11:56:00Z
- **Completed:** 2026-08-28T12:08:00Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- `readFeatureSource` is the package's sole `node:fs` consumer, verified by `grep -rl 'node:fs' packages/gherkin/src` returning exactly one path. Plan 02-10's gate script has exactly one file to assert against.
- The cascading-error handler survives both upstream shapes, and that claim is proven by mutation rather than asserted: removing `?? [thrown]` reproduces `TypeError: errors is not iterable` at `const [first] = errors` — the exact second-bug-inside-the-catch failure Pitfall P5 predicts (threat T-02-04).
- The "line comes from the first collected error, not the composite" claim is likewise mutation-proven: swapping `lineOf(first)` for `lineOf(thrown)` turns four tests red at once, because `CompositeParserException.location` is genuinely `undefined`.
- `UnknownDialect` is a distinct reason from `ParseFailed`, routed by `instanceof Errors.NoSuchLanguageException` on `errors[0]` — which matters because `NoSuchLanguageException` arrives through the *same* composite wrapper as every other parse error.
- One misplaced tag's three cascading errors collapse to `Failed to parse <uri>:` + the first error verbatim + `2 further parse error(s) followed from this one (line 7, line 9). They are usually consequences of the first — fix that one and re-run.` No individual upstream message is truncated, honouring the package's locked full-content policy.
- 10 tests, 4 distinct reasons, 9 `.reason` assertions, exactly 1 message assertion (the collapsed count). Whole-repo suite: 6 files, 126 tests, all passing.

## Task Commits

1. **Task 1: `src/Source.ts`** — `31d6dd8` (feat)
2. **Task 2: `src/Parser.ts` and `src/Pickles.ts`** — `18d787e` (feat)
3. **Task 3: `test/Parser.test.ts`** — `c677f98` (test)

## Files Created

- `packages/gherkin/src/Source.ts` — `readFeatureSource(path)`; the single `node:fs` import, a `SystemErrorFields` type guard that names `code` and `syscall` in the message, and a doc comment recording that the absent path guard is a decision (T-02-03), not an oversight
- `packages/gherkin/src/Parser.ts` — `parseDocument(source, uri, newId)`; `collectErrors` (the two-shape normaliser), `lineOf` (first-error line extraction), `describeParseFailure` (first error verbatim + collapsed consequence count), `loadFeatureError` (the `exactOptionalPropertyTypes` shape picker)
- `packages/gherkin/src/Pickles.ts` — `compilePickles(document, uri, newId)`; one function, no filtering or sorting or deduplication, wrapping a `compile` throw as `ParseFailed`
- `packages/gherkin/test/Parser.test.ts` — F16, F17, F18, F10, F15, F20, F12, an all-Group-B sweep, the F21 positive control, and the Pitfall P5 two-shape guard

## Decisions Made

- **How to reach the bare-exception shape without widening the API.** `Parser.stopAtFirstError` is a public field on the upstream parser, but `parseDocument` constructs its own parser, so the option is unreachable through this package's surface. The two candidate fixes were to add a `stopAtFirstError` option to `parseDocument` (public surface `loadFeature` would never use) or to export the internal normaliser (extra export, weaker encapsulation). Chosen instead: capture a *genuine* bare `UnexpectedTokenException` by running the upstream parser directly with `stopAtFirstError = true`, then `vi.spyOn(GherkinParser.prototype, "parse")` to make `parseDocument`'s own parser throw it. The test asserts the captured value really has no `.errors` before using it, so the guard cannot silently degrade into testing a composite.
- **`collectErrors` is instanceof-gated, not duck-typed.** `thrown.errors ?? [thrown]` is applied only after `thrown instanceof Errors.GherkinException`; anything else becomes `[thrown]` if it is an `Error` and `[]` otherwise. A bare `errors` property on some unrelated throw can never be mistaken for a collected cascade.
- **`describeParseFailure` names lines, not indices.** Each collapsed consequence contributes `line N` (or `unknown line` where the error carries no location), so the summary line is directly actionable without the reader counting errors.
- **`REQUIREMENTS.md` untouched.** The plan frontmatter lists `PARSE-01` and `PARSE-03`, but PARSE-01 is about `loadFeature` (plan 02-08's module) and PARSE-03 is the leftover-placeholder check (`Validate.ts`, a later plan). Marking them complete here would make `REQUIREMENTS.md` say something untrue, which AGENTS.md §4 forbids. `requirements-completed` is therefore empty and the traceability rows stay `Pending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two acceptance-criteria greps matched the module doc comment**

- **Found during:** Task 2, running the criteria greps before committing
- **Issue:** The plan's action text mandates that Parser.ts's doc comment explain the `err.name` trap and the one-generator-per-call rule. Written naturally, that prose contains the literal strings `err.name`, `.name ===`, `== null` and `IdGenerator.uuid(` — every one of which a Task 2 acceptance grep requires to be absent from the file. The doc comment the plan asks for and the greps the plan asks to pass were in direct conflict.
- **Fix:** Reworded the prose to carry identical meaning without the literals: "never by the error's `name` property … all of them report the useless string `"Error"`", "a strict comparison against `undefined` rather than the loose nullish comparison", "exactly one uuid-backed id generator per `loadFeature` call". No code changed; only comment wording.
- **Files modified:** `packages/gherkin/src/Parser.ts`
- **Verification:** `grep -c 'err\.name'` = 0, `grep -c '\.name ==='` = 0, `grep -c '== null'` = 0, `grep -cE 'IdGenerator\.(uuid|incrementing)\('` = 0 across both modules
- **Committed in:** `18d787e`

**2. [Rule 1 - Bug] The F21 positive control asserted the wrong feature name**

- **Found during:** Task 3, first test run
- **Issue:** The test asserted `document.feature?.name === "correlation"`; the fixture's actual name is `"correlation across every nesting level"`. This was my assumption, not the plan's — the plan only requires the fixture parse and compile to a non-empty array.
- **Fix:** Corrected the expected string to the fixture's real name.
- **Files modified:** `packages/gherkin/test/Parser.test.ts`
- **Verification:** `pnpm vitest run packages/gherkin/test/Parser.test.ts` — 10 passed
- **Committed in:** `c677f98`

### Deliberate Non-Deviations

- **`grep -c 'GherkinInMarkdownTokenMatcher' packages/gherkin/src/Parser.ts` returns 1, not 0.** The criterion is worded "is 0 **outside the doc comment**", and the plan's action text explicitly requires the omission be stated in the doc comment. The single occurrence is that sentence; there is no import of it and no runtime reference. A verifier running the bare grep should read the qualifier.
- **The upstream FYI about `Errors.UnexpectedTokenException` needed no action.** The plan's Task 2 design already discriminates `NoSuchLanguageException` explicitly and falls through to `ParseFailed`, so nothing in this plan ever names the non-existent class. It is mentioned only in Parser.ts's doc comment, as prose explaining why no special case exists.

---

**Total deviations:** 2 auto-fixed (1 blocking criteria/action conflict, 1 bug in my own test assumption)
**Impact on plan:** None on scope or design. Every module, every export, and every required test was delivered as specified.

## Issues Encountered

- The worktree was spawned at a stale base (`f640f4a`, before Phase 2 existed) and had no `node_modules`. Resolved by `git reset --hard 813bdbd` per the startup branch check — which ran only after the HEAD assertion confirmed a `worktree-agent-*` branch — then `pnpm install --frozen-lockfile`.

## Verification Results

| Gate | Result |
| --- | --- |
| `pnpm build` (`tsc -b`) | exit 0 |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` (madge) | no circular dependency found |
| `pnpm vitest run packages/gherkin/test/Parser.test.ts` | 10 passed (requirement: at least 9) |
| `pnpm test` (whole repo) | 6 files, 126 tests passed |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |
| `grep -rl 'node:fs' packages/gherkin/src` | exactly `packages/gherkin/src/Source.ts` |
| `grep -cE 'resolve\(\|normalize\(\|\.\./' Source.ts` | 0 (no path sanitisation) |
| `grep -c 'as unknown as\| as any' Source.ts` | 0 |
| `grep -c 'instanceof Errors\.' Parser.ts` | 4 (requirement: at least 1) |
| `grep -c 'err\.name' / '\.name ===' / '== null' Parser.ts` | 0 / 0 / 0 |
| `grep -c 'errors ??' Parser.ts` | 2 (requirement: at least 1) |
| `grep -c '=== undefined\|!document.feature' Parser.ts` | 4 (requirement: at least 1) |
| Group B reasons across `src/*.ts` | 4 of 4 |
| `grep -cE 'IdGenerator\.(uuid\|incrementing)\(' Parser.ts Pickles.ts` | 0 / 0 |
| Distinct reasons asserted in `Parser.test.ts` | 4 of 4 |
| `grep -c 'reason).toBe' Parser.test.ts` | 9 (requirement: at least 4) |
| `grep -c 'message).toMatch(' Parser.test.ts` | 1 (the collapsed-count assertion only) |
| `grep -c 'from "\.\./src/index' Parser.test.ts` | 0 (no barrel import) |
| Mutation: `thrown.errors ?? [thrown]` -> `thrown.errors` | P5 test fails with `TypeError: errors is not iterable` |
| Mutation: `lineOf(first)` -> `lineOf(thrown)` | 4 tests fail (F17, F10, F15, F20) |

## Known Stubs

None. All three modules are complete implementations of their stated contract. `Pickles.ts` is deliberately thin — a pass-through over `compile()` — but that is its specified design, not an unfinished stub: every silently-zero and silently-wrong compile case is detected in `Validate.ts` over the correlated result, where the AST is available to explain why.

## Threat Flags

None. This plan adds no network endpoint, no auth path, and no schema at a trust boundary. The one new file-access pattern is `readFeatureSource`, which is already in the plan's threat register as T-02-03 and dispositioned `accept`.

Register dispositions honoured:

- **T-02-04 (DoS, cascading-error handling)** — mitigated and mutation-proven: `errors ?? [thrown]` cannot raise a `TypeError` inside the catch, and the output is bounded by collapsing consequences to a count plus lines.
- **T-02-11 (Spoofing, error-class discrimination)** — mitigated: routing is `instanceof`-only; the `name` property is never read anywhere in `src/`.
- **T-02-05 (Input validation)** — mitigated: 100% of parsing is delegated upstream. No `new RegExp`, no `eval`, no custom lexer in any of the three modules.
- **T-02-02 (Information disclosure)** — accepted as specified: upstream error text is reproduced verbatim; only the count of consequences is collapsed.
- **T-02-03 (Tampering, path handling)** — accepted as specified: no resolution, no canonicalisation, no containment check, verified absent by grep.

## Next Phase Readiness

- `Correlate.ts` (02-05 onward) can assume it receives a `GherkinDocument` whose `feature` is present — `parseDocument` has already rejected the `NoFeature` case — and a pickle array compiled with the same id generator, so AST node ids and pickle ids live in one namespace.
- `loadFeature.ts` owns constructing the single `IdGenerator.uuid()` per call. Neither `Parser.ts` nor `Pickles.ts` constructs one, and both take it as a required parameter.
- `parseFeature(source, uri)` (decision D1) has no filesystem dependency: it can be built from `parseDocument` + `compilePickles` alone, with `loadFeature(path)` as the two-line `readFeatureSource` wrapper.
- Plan 02-10's `node:fs` gate script has exactly one file to assert against today.
- `REQUIREMENTS.md` rows for PARSE-01 and PARSE-03 remain `Pending` and are the responsibility of whichever plan lands `loadFeature.ts` and `Validate.ts`.

## Self-Check: PASSED

All four claimed artifacts verified on disk and all three claimed commits verified present in `git log`.

---

*Phase: 02-loadfeature-parse-compile-correlate*
*Completed: 2026-08-28*
