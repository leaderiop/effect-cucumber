# Starved fixtures — deliberately broken Features that no runner ever sees

Every `.feature` file in this directory is a **starved fixture**. None is handed to `describeFeature`, none produces a
test, and none is expected to be green. [`../negative-requirements.test.ts`](../negative-requirements.test.ts) drives
each one and asserts the specific named error or guarantee it produces, and **that wrapper is what passes**. The fixture
is the tagged artifact; the wrapper is the evidence.

This is the one convention the parent directory's
[`../README.md`](../README.md) states that this subdirectory does **not** inherit: **these files deliberately have no
`.steps.test.ts` partner.** A reader who finds `unmatched-step.feature` and goes looking for `unmatched-step.steps.test.ts`
is not looking at drift — there is nothing to find, and one wrapper covers all five. Everything else in that README still
applies here unchanged: the `@REQ-EC-NNN` rule, the byte-exactness rule, and the zero-escape-hatch-type rule, which
scans this subdirectory's `.feature` files too (see the third observation below).

## Why these five requirements cannot be ordinary acceptance Scenarios

All five are **fails-loudly** behaviors, so a Scenario demonstrating one directly would be a RED test rather than a green
one. That is 11-CONTEXT.md **D-02**, and its answer is `scripts/verify-tsgo-gate.sh`'s satisfied/starved flip pair
(lines 139-201) lifted one level up, from compile time to run time: the deliberately-failing artifact is committed and
carries the tag, and a wrapper drives it and asserts the specific named failure.

It is a committed **pair** rather than a script that edits a file and re-runs, and that shape is the whole point. There
is no mutable working tree, no cleanup path that can leave the repository dirty, and the flip is re-proven on every CI
run instead of once at authoring time.

| Fixture                          | Tag           | v1 requirement | What the wrapper asserts                                                                    |
| -------------------------------- | ------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `background-placeholder.feature` | `@REQ-EC-003` | PARSE-03       | `LoadFeatureError` with `reason: "UninterpolatedPlaceholder"`, citing this file and a line  |
| `unmatched-step.feature`         | `@REQ-EC-007` | MATCH-03       | `StepMatchError` with `reason: "UndefinedStep"`                                             |
| `ambiguous-step.feature`         | `@REQ-EC-008` | MATCH-04       | `StepMatchError` with `reason: "AmbiguousStep"`, naming EVERY matching pattern              |
| `unused-pattern.feature`         | `@REQ-EC-009` | MATCH-05       | exactly one `UnusedStepDefinitionWarning` on the plan, and NO error — the Feature is sound  |
| `after-on-failure.feature`       | `@REQ-EC-018` | RUN-02         | the `After` hook ran, the third step did not, and the second step's own error is not masked |

Each file is named for the reason it fails, so a failing wrapper assertion names the defect.

## The two-check rule, inherited from `scripts/verify-tsgo-gate.sh`

Every assertion in the wrapper checks **two** things: that the failure happened, **and** that it was the named one.
Asserting only that something failed passes against a fixture failing for an entirely unrelated reason — a typo in the
Gherkin, a missing file, a `.feature` that no longer parses at all. The weaker check is green in every one of those
states and reports nothing.

That is not a theoretical concern: **mutation A**, recorded in the wrapper's own module doc comment, weakens the
`@REQ-EC-007` assertion to "a failure occurred" and then makes the fixture fail for a different reason. The weakened
assertion stays green. Do not simplify the sharp form back into the blunt one.

## Every glob that must reach this subdirectory was VERIFIED to, not assumed

ASSUMPTION-11-B: these five fixtures live in a SUBDIRECTORY, which is new — every other acceptance `.feature` file sits
flat in the parent. Three globs have to reach in here, and each was run against the real tree with the five fixtures in
place rather than reasoned about.

1. **`vitest.config.ts`'s `gherkinTags("packages/vitest/test/acceptance/**/*.feature")`.** Invoked directly with the
   config's own pattern, it returns 26 names, of which 22 are `@REQ-EC-NNN` — ids 001 through 022, contiguous. The five
   ids introduced here (003, 007, 008, 009, 018) are among them. Before this directory existed the same call returned 17
   REQ ids. `tinyglobby`'s `**` crosses the directory boundary, so no config edit was needed.

   The ids in this paragraph and in the one below are written WITHOUT their `@` prefix on purpose. This plan's own
   acceptance criterion counts `@REQ-EC-NNN` occurrences across the whole of this directory rather than across its
   `.feature` files alone, so an id spelled in full in this README would be counted as a sixth and a seventh tag. It is
   the same self-invalidation shape `scripts/verify-acceptance-no-any.sh`'s METHOD NOTE names, arriving from a different
   direction: a criterion that counts a literal also counts the prose explaining it.
2. **`scripts/verify-acceptance-no-any.sh`'s `.feature` scan.** Its `find` is recursive
   (`find "$ACCEPTANCE_DIR" -type f \( -name '*.steps.test.ts' -o -name '*.feature' \)`), and its file list now includes
   all five files in this directory. Its population control is unaffected: it counts `*.steps.test.ts` only, this
   directory contains none by design, and the count stays at 5 with `MIN_STEP_MODULES=5` still satisfied. The same is
   true of `scripts/verify-acceptance-ref-state.sh`, which shares both the constant and the suffix.
3. **`spec/scripts/verify-traceability.sh` check 4's repo-wide grep.** `grep -rhoE '@REQ-EC-[0-9]{3}' . --include='*.feature'`
   returns 22 occurrences, one per id, five of them from this directory.

No glob had to be fixed, and no directory was flattened.

### Observation 3 needed a measurement the plan did not anticipate

11-06-PLAN.md predicted that adding these five tags would turn check 4 **RED** until their `spec/traceability.md` §5
rows landed, and that the red gate would itself be the proof that the repo-wide grep reaches this subdirectory. It did
not go red. Check 4's second half is `grep -q "REQ-EC-NNN" spec/traceability.md` over the WHOLE file, and §5's preamble
already listed all five ids longhand in its not-yet-carried sentence — so a tag merely **mentioned** in prose satisfies
the check.

The proof was therefore taken directly instead, and sharpened into a measurement: with `REQ-EC-003/007/008/009/018`
substituted out of `spec/traceability.md` and nothing else changed, check 4 went **FAIL**, naming exactly those five ids
and no others. Performed, run, then reverted. That single run states both halves at once: the repo-wide grep genuinely
reaches this subdirectory, **and** the only thing that had been holding check 4 green was a prose mention.

This is the fourth time check 4's weakness has been recorded in this repository (11-03, 11-04, 11-05, here). It is why
`verify-traceability.sh` check 5 asserts membership of the §5 **table** — a real row, matched as a row — and never a
substring of the file.
