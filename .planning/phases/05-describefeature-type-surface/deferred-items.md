# Deferred items — Phase 05

Out-of-scope discoveries logged during execution. Not fixed in this phase.

## The worked example in `spec/behaviors/01-steps-and-world.md`

Found during plan 05-06, Task 1.

The `` ```typescript `` worked example at the foot of the file has two defects that
the planned doc-examples check will surface the moment it is wired:

1. **It imports from the `effect` barrel** — `import { Context, Effect, Layer, Ref } from "effect"` —
   rather than using submodule namespace imports (`import * as Effect from "effect/Effect"`), which
   `AGENTS.md` §3 requires and which this repo's `effect/no-import-from-barrel-package` oxlint rule
   enforces on real source (plan 05-02 hit it there).
2. **It calls `expect` without importing it.** `AGENTS.md` §2 requires a `` ```typescript `` fence to
   import what it uses.

Neither is caught today: the doc-examples check is not wired (`spec/roadmap.md`, "Blocking first
release" item 4), and dprint does not resolve imports. The example is otherwise valid against the
corrected `describeFeature` signature, which is what plan 05-06 was scoped to guarantee.

**Fix when:** the doc-examples compile check lands. Both defects should fall out of it failing.
