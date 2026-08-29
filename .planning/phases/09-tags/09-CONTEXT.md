# Phase 9: Tags - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Gherkin tag on a Scenario — including tags inherited from its Feature, Rule, and Examples
block — becomes a native vitest tag on the emitted `it.effect` call. `@skip` additionally routes to
`it.effect.skip`. `@only` is never routed to `it.effect.only` (which fails CI by design) — it is
emitted as a plain tag, and running just that Scenario locally is a caller-side
`vitest --tagsFilter '@only'` choice. This phase also adds a library-level `includeTags`/
`excludeTags` option on `describeFeature`'s options object (a deliberate extension beyond the
original ADR-EC-020 scope — see Implementation Decisions below).

Tag parsing, flattening, and inheritance (Feature → Rule → Examples → Scenario) are **already
built** — `@effect-cucumber/gherkin`'s `Correlate.ts` already produces a fully-flattened
`ParsedScenario.tags: ReadonlyArray<string>` per ADR-EC-014. This phase is entirely about the
`@effect-cucumber/vitest` package: reading that `tags` field and wiring it through
`Plan.ts` → `Runner.ts` → `TestApi.ts` → the real `it.effect` call.

</domain>

<decisions>
## Implementation Decisions

### Library-level tag filtering (extends beyond ADR-EC-020)

ADR-EC-020 (Accepted, 2026-08-28) explicitly decided `excludeTags`-style filtering should be
**pure vitest `--tagsFilter` CLI filtering**, with no `describeFeature`-time registration filter.
The user deliberately overrides that scope boundary for this phase:

- **D-01:** Add BOTH `includeTags` and `excludeTags` to `describeFeature`'s options object — not
  just `excludeTags` as ROADMAP.md originally named. Symmetric API: `includeTags` restricts
  registration to a tag set, `excludeTags` removes a tag set.
- **D-02:** Syntax is a **plain array of tag strings** (e.g. `excludeTags: ["@slow", "@wip"]`) —
  not vitest's boolean expression grammar (`"@slow && !@wip"`). No expression parser to write,
  document, or keep in sync with vitest's own `--tagsFilter` grammar.
- **D-03:** Filtering happens at **registration time, skipping emission entirely** — a Scenario
  excluded by `excludeTags` (or not selected by `includeTags`) never becomes an `it.effect` call.
  It does not appear in test output at all, as if the Scenario were absent from the `.feature`
  file. (Contrast with `@skip`, which still emits the test but as `it.effect.skip` — this option
  is a coarser, author-side filter, not another skip mechanism.)
- **This is additive, not a replacement.** vitest's native `--tagsFilter` CLI mechanism still
  works independently on whatever tests DO get emitted — `includeTags`/`excludeTags` narrows what
  `describeFeature` registers in the first place; `--tagsFilter` narrows what runs among
  registered tests. The two compose (registration-time filter, then CLI-time filter), they don't
  compete.
- **Spec impact:** This decision amends ADR-EC-020's stated scope. The planner/researcher should
  flag this to the spec-reconciliation step of whichever plan closes this phase (mirroring how
  Phase 8's final plan reconciled spec against what was actually built) — ADR-EC-020's "Decision"
  section will need an amendment noting the `includeTags`/`excludeTags` addition, or a follow-up
  ADR should supersede it. Do not silently let the ADR text and the shipped code diverge.

### Everything else in RUN-05: follow the existing ADR/BEH exactly, no open questions

The rest of Phase 9's design is **already fully decided** by prior spec work and was confirmed,
not re-litigated, in discussion:

- **D-04:** Every tag (including inherited ones) is emitted as a native vitest tag via the
  `tags` field of vitest's `TestOptions` (the object form of `it.effect`'s third parameter,
  `V.TestOptions`) — confirmed against the installed `vitest@4.1.11` / `@vitest/runner@4.1.11`
  type declarations: `TestOptions.tags?: string[] | string`. Tag strings keep their literal `@`
  prefix from the `.feature` file (e.g. `"@skip"`, not `"skip"`) — this matches ADR-EC-020's own
  `--tagsFilter '@slow && !@wip'` examples and requires no normalization.
- **D-05:** `@skip` additionally routes to `it.effect.skip` (a real vitest skip, not just a tag).
  Since `it.effect.skip` never invokes the test body, and `Plan.ts`'s `planFeature` never throws
  for an unresolved step (`StepMatchError` is only surfaced when that step's Effect actually
  runs — see `Plan.ts`'s own documented behavior), routing `@skip` scenarios through the real
  `.skip` path automatically satisfies Pitfall 15's requirement ("a `@skip` Scenario containing an
  unmatched step reports skipped, not undefined") with no extra design needed.
- **D-06:** `@only` is NEVER routed to `it.effect.only`. It is emitted as a plain tag only.
- **D-07:** Only `@skip` and `@only` are reserved/special-cased. Every other tag (`@slow`, `@wip`,
  anything a Feature author writes) is a plain pass-through tag with no library-defined behavior
  beyond being filterable.
- No vitest config changes are needed: the project currently has no `vitest.config.ts` at all
  (defaults), and vitest's `strictTags` (which would require pre-declaring every used tag) is off
  by default — arbitrary per-Feature tags need no static declaration.

### Claude's Discretion

- Exact shape of the `TestApi.ts` interface extension (how tags/skip options thread from
  `Runner.ts` through to the real `it.effect` call) — this is implementation architecture, not a
  user-facing decision. `TestApi.ts` note (b) already documents that `skip`/`only` were
  *deliberately* left off the interface in Phase 6, reserved for this phase.
- Whether `it.effect`'s `TestOptions.skip` field or a separate `.skip` method call is used to
  route `@skip` — both are valid per vitest's type surface; pick whichever keeps `TestApi.ts`'s
  existing "no vitest import in Runner.ts" seam (note (a)) intact.
- Tag matching for `@skip`/`@only`/`includeTags`/`excludeTags` is exact-string, case-sensitive
  (Cucumber tag convention) — no fuzzy or case-insensitive matching was discussed or requested.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements this phase implements
- `.planning/REQUIREMENTS.md` (RUN-05 entry, line ~41) — the full requirement text, cites
  ADR-EC-020 and BEH-EC-008
- `.planning/ROADMAP.md` §"Phase 9: Tags" (lines 380–394) — goal, 4 success criteria, research flag

### Decisions / behaviors this phase implements
- `spec/decisions/020-vitest-native-tags-for-skip-only.md` — ADR-EC-020, the core design
  (native tag emission, `@skip` → `it.effect.skip`, `@only` stays plain, CLI-only filtering as
  originally scoped — **this phase's `includeTags`/`excludeTags` decision extends/amends this
  ADR's stated scope on the filtering point; see D-01 through D-03 above**)
- `spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008 (lines 97–113) — the MUST-level
  requirement text and a worked example (`@skip` on a Scenario, shared-Layer Feature)
- `.planning/research/PITFALLS.md` Pitfall 15 (line 443, skip-ordering note at line ~1033) —
  "a `@skip` Scenario containing an unmatched step reports skipped, not undefined"

### Existing code this phase extends
- `packages/gherkin/src/Correlate.ts` (lines 110, 155, 346, 459, 489, 501) — already produces
  flattened, inherited `tags: ReadonlyArray<string>` on every `ParsedScenario`/`ParsedRule`/
  `ParsedFeature`. Nothing here needs to change — this phase only *reads* `ParsedScenario.tags`.
- `packages/gherkin/src/Model.ts` (lines 133–180) — `tags` field type definitions on the parsed
  model types.
- `packages/vitest/src/TestApi.ts` — the seam Runner.ts uses to reach `describe`/`it.effect`.
  Note (b) (around line 25) explicitly documents that `skip`/`only` were left off in Phase 6,
  reserved for this phase. Note (a) documents the no-vitest-import constraint that must survive
  whatever extension this phase makes.
- `packages/vitest/src/Runner.ts` — walks the `FeaturePlan` and emits one `describe`/`it.effect`
  call per Scenario via the injected `TestApi`. This is where tag/skip values get read off each
  `ScenarioPlan` and passed through to the `TestApi.effect` call.
- `packages/vitest/src/describeFeature.ts` — the composition root; owns the real
  `vitestTestApi: TestApi = { describe, effect: it.effect }` binding (around line 223) that will
  need to grow to carry tags/skip, and is where the new `includeTags`/`excludeTags` options-object
  field would be read and applied before `Runner.ts`'s emission walk.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ParsedScenario.tags` (and the equivalent on `ParsedRule`/`ParsedFeature`) — fully flattened,
  already includes inherited tags from every ancestor scope. No new parsing/inheritance logic
  needed in this phase.
- vitest's own `TestOptions.tags?: string[] | string` and `TestOptions.skip?: boolean` (confirmed
  in the installed `@vitest/runner@4.1.11` type declarations) — the target shape this phase's
  emission code needs to produce; no custom tag-encoding scheme required.

### Established Patterns
- `TestApi.ts`'s seam pattern (Pattern 3 in `.planning/research/ARCHITECTURE.md`): `Runner.ts`
  never imports a test framework directly; every framework touchpoint is an injected interface
  member. Any interface change this phase makes must preserve that — no `vitest`/`@effect/vitest`
  import creeping into `Runner.ts` or `TestApi.ts`.
- Prior phases (06, 07, 08) each left a "reserved but not yet implemented" comment/type gap for
  the next phase to fill (e.g. `TestApi.ts` note (b) for this exact phase) — check for other such
  markers referencing Phase 9 or RUN-05 before starting.

### Integration Points
- `Runner.ts`'s per-Scenario emission loop is the single point where tag/skip values need to flow
  from `ScenarioPlan` into the `TestApi.effect` call.
- `describeFeature.ts`'s composition root is where the new `includeTags`/`excludeTags`
  options-object field is read and where registration-time filtering (D-03: skip emission
  entirely) needs to short-circuit before a Scenario reaches `Runner.ts`'s emission walk at all.

</code_context>

<specifics>
## Specific Ideas

No specific implementation-shape requirements beyond the decisions above — the user's input was
entirely in scope-setting (add `includeTags`/`excludeTags`, array-of-strings syntax, exclude from
emission entirely), not in favor of any particular code shape.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The `includeTags`/`excludeTags` addition is an
extension of RUN-05's existing scope (tag filtering was already named in BEH-EC-008 "with no
decided mechanism"), not a new capability requiring its own phase.

### Reviewed Todos (not folded)
None — `todo.match-phase` returned zero matches for Phase 9.

</deferred>

---

*Phase: 9-Tags*
*Context gathered: 2026-08-29*
