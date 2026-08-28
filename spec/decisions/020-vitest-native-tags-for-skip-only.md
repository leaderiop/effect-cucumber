# ADR-EC-020: `@skip`/`@only` and future custom tags map to vitest v4's native tag system

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** GSD Stack/Pitfalls research found vitest v4 shipped a native tag mechanism after the original tag-routing decision was made

## Context

The "Test runner integration" mapping (predating the ADR numbering, folded
into BEH-EC-008) originally routed `@skip`/`@only` tags to `it.effect.skip`/
`it.effect.only`. GSD Pitfalls research verified that vitest `.only` fails CI
by design (vitest exits non-zero if any `.only` is present in a CI run,
specifically to catch an accidentally-committed `.only`) — meaning a Gherkin
`@only` tag, if naively routed to `it.effect.only`, would make a Feature file
containing one **fail CI outright**, the opposite of `@only`'s intent (running
just that Scenario during local development).

Separately, `spec/roadmap.md` § Planned already parked "custom, non-reserved
tags" (e.g. `@slow`, `@wip`) as unspecified. GSD Stack/Pitfalls research found
vitest v4 ships a native test-tag system (`--tagsFilter '@slow && !@wip'`-style
CLI filtering) that maps almost exactly onto Gherkin's own tag model —
adopting it closes most of that parked roadmap item at effectively no extra
design cost, rather than requiring a bespoke tag-filtering mechanism later.

## Decision

Gherkin tags map to vitest v4's native tag system, not to `.skip`/`.only`:

- Every tag on a Scenario (including `@skip`/`@only`, inherited from
  Feature/Rule/Examples per the tag-inheritance mechanics ADR-EC-014
  resolved) is emitted as a vitest tag on the generated `it.effect` call.
- `@skip` is additionally translated to `it.effect.skip` — skipping is
  unambiguous and safe to route directly, unlike `@only`.
- `@only` is **not** routed to `it.effect.only` (which would fail CI). It's
  emitted as a plain tag; running "only this Scenario" locally becomes
  `vitest --tagsFilter '@only'`, a caller-side choice rather than something
  the library forces onto every CI run.
- `excludeTags` (already named in BEH-EC-008 but with no decided mechanism)
  is implemented as native vitest tag filtering (`--tagsFilter`), not a
  `describeFeature`-time registration filter — this also means tag-based
  filtering works from the vitest CLI directly, consistent with this
  library's "no custom reporter, no custom CLI" posture (`spec/overview.md`).

## Consequences

**Positive**:

- `@only` no longer has a footgun where using it as intended (a local
  development convenience) breaks CI — verified failure mode avoided
  entirely by not routing it to `it.effect.only`.
- Custom, non-reserved tags (`@slow`, `@wip`, anything a Feature author
  writes) get real filtering support via `--tagsFilter` with no additional
  design or implementation — this closes most of `spec/roadmap.md`'s parked
  "custom tags" item.
- Consistent with the project's existing posture that vitest's own tooling
  (reporters, `-t` filtering) is the reporting/filtering story, not a
  bespoke mechanism.

**Negative**:

- vitest v4's native tag system is new enough that its config-time
  tag-declaration mechanics need confirming against the installed version
  during implementation, rather than being as thoroughly load-bearing-tested
  as `it.effect.skip`/`.only` (which have existed for longer).
- `@only`'s local-development ergonomics change from "just works when the
  tag is present" (the original `it.effect.only` routing) to "requires
  passing `--tagsFilter '@only'` on the command line" — a real, if small, DX
  regression from the originally-specified behavior.

**Trade-off accepted**: the CI-breaking footgun in the original `@only`
routing is a correctness bug, not a style preference — avoiding it is worth
the small DX cost of requiring an explicit `--tagsFilter` flag rather than
`@only` "just working" the way `@skip` still does.
