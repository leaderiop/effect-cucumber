# Deferred items — Phase 11

Out-of-scope discoveries logged rather than fixed, per the executor's scope boundary.

## ~~`spec/README.md`'s Behaviors table lists 3 of 7 behavior documents~~ (RESOLVED at v1.0 close)

Fixed 2026-08-30 during v1.0 milestone close: the table now lists all 7 behavior
documents with corrected ID ranges (01 row now includes BEH-EC-013, 03 row now
includes BEH-EC-018), and the "Reading order" section now says "seven behavior
files" instead of "three". See commit `docs(spec): list all 7 behavior docs in
README table`.

Found during plan 11-09, Task 2, while correcting that file's ADR count and Process row.

`spec/README.md` § Contents → Behaviors names only:

- `01-steps-and-world.md` (BEH-EC-001–004)
- `02-shared-layers-and-tags.md` (BEH-EC-005–008)
- `03-rules-outlines-and-testclock.md` (BEH-EC-009–012)

`behaviors/index.yaml` resolves **seven** entries — the four missing rows are
`04-loadfeature-parse-and-validation.md` (BEH-EC-014),
`05-step-matching-and-parameter-types.md` (BEH-EC-015),
`06-datatable-and-docstring-arguments.md` (BEH-EC-016) and
`07-hook-ordering-and-guarantees.md` (BEH-EC-017). The 01 row is also missing
BEH-EC-013 from its ID range.

Not fixed here: unrelated to the acceptance suite, and `spec/scripts/verify-traceability.sh`
does not read this table (its index.yaml ↔ disk check reads `behaviors/index.yaml`,
which is correct and complete). The reading-order advice at the bottom of the same file
sends a new reader through "the three behavior files in order", which is the same defect
stated a second way, so both should be fixed together.

Nothing automated catches this — a hand-maintained table with no gate is exactly the
shape `spec/traceability.md`'s own §1 preamble warns about for its Source module column.
