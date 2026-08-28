# Requirement ID Scheme

## Infix

`EC` — a 2-letter infix baked into every prefix, purely to disambiguate
identifiers when multiple specs are open side by side (e.g. alongside
`hex-di`'s `SF` or `qadi`'s `QD`).

## ID families

| Prefix | Meaning | Lives in |
| ------ | ------- | -------- |
| `BEH-EC-NNN` | Behavior — a testable contract | `spec/behaviors/*.md` |
| `INV-EC-NNN` | Invariant — a property that holds for every execution | `spec/invariants.md` |
| `ADR-EC-NNN` | Decision — the *why* behind a design choice | `spec/decisions/NNN-slug.md` |
| `REQ-EC-NNN` | Acceptance requirement — a tag on a `.feature` file in the library's own test suite | `spec/traceability.md` §5 |

## Rules

- **IDs are permanent.** A withdrawn item is marked "Withdrawn" in place and
  keeps its number — reuse would silently repoint any cross-reference made
  before the withdrawal.
- **IDs are allocated contiguously**, in the order they're written, never out
  of a reserved future range.
- **Behavior IDs are allocated in blocks per file** (see
  `spec/behaviors/index.yaml`'s `id_range` field) so a later insertion into an
  existing file doesn't force renumbering every ID after it.
- **Decisions are never renumbered**, even when superseded — the old ADR's
  status changes; a new ADR gets the next number.

## Amending vs. superseding a decision

Create a **new** ADR for a genuinely new design question. **Amend** an
existing ADR when later work narrows or corrects the same question — the
correction is kept as a `>` blockquote appended under the original text, not a
deletion, and the amending ADR opens with a line noting what it amends. History
is preserved either way; nothing is silently rewritten.

## Traceability discipline

Every `BEH-EC-NNN`, `INV-EC-NNN`, and `ADR-EC-NNN` must appear in
`spec/traceability.md`. `spec/scripts/verify-traceability.sh` checks this
mechanically — run it before committing a spec change.
