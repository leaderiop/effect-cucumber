# Contributing

This is a routing index, not a tutorial. Find the row that matches what you're
changing, then go read that document — not this one.

| I'm changing... | Start at |
| ---------------- | -------- |
| Public API shape, DSL surface, or a design decision | `spec/decisions/` — write a new ADR, or amend an existing one if you're narrowing/correcting a prior decision (see `spec/process/requirement-id-scheme.md`) |
| What the library does / a testable contract | `spec/behaviors/` — add or revise a `BEH-EC-NNN` entry |
| A property that must hold for every execution | `spec/invariants.md` |
| Terminology | `spec/glossary.md` |
| What's built vs. planned vs. explicitly out of scope | `spec/roadmap.md` |
| Cross-references between the above | `spec/traceability.md` |
| Engineering rules (imports, tests, spec discipline) | `AGENTS.md` |
| Package/workspace layout | `spec/overview.md` § Packages |

After any spec change, run `bash spec/scripts/verify-traceability.sh` before
committing — it catches orphaned files, untraced invariants/decisions, and
broken relative links.
