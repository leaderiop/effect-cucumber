# ADR-EC-030: `gherkinWatchTriggers` is a Vite plugin over `test.watchTriggerPatterns`, and reruns the whole `test.include` set rather than guessing a per-file mapping

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** resolves [wayfinder ticket #20](https://github.com/leaderiop/effect-cucumber/issues/20), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11)

## Context

`packages/vitest/test/acceptance/README.md` and `scripts/verify-watch-rerun.sh` both already record a
real, measured gap: a `.feature` file loaded through `loadFeature(path)` (`NodeFileSystem.readFileString`,
a plain `fs` read) is invisible to Vite's module graph, so editing it under `vitest --watch` triggers no
rerun at all. `scripts/verify-watch-rerun.sh` proves the ONE workaround that already works today —
importing the `.feature` file's text with a Vite `?raw` import instead, which puts it into the module
graph — but that is not the pattern `loadFeature` documents or any committed acceptance pair uses; it
exists in that script purely to give the gate something to measure.

`spec/roadmap.md` § Planned locked the real mechanism before this ADR was written: Vitest's own
`test.watchTriggerPatterns` config option (3.2.0+), checked before the module-graph fallback that a path
read always misses, shipped as a Vite plugin appending the same glob `gherkinTags(...)` already consumes.
What the roadmap bullet did not settle — because it wasn't yet known — is `WatchTriggerPattern`'s real
shape, read directly out of the installed `vitest@4.1.11`'s own type declarations
(`node_modules/vitest/dist/chunks/reporters.d.*.d.ts`):

```ts
interface WatcherTriggerPattern {
  pattern: RegExp
  testsToRun: (file: string, match: RegExpMatchArray) => string[] | string | null | undefined | void
}
```

This is materially different from "append the glob" as a literal instruction. `pattern` is a `RegExp`
tested against the changed file's absolute, slash-normalized path — not a glob string — and
`testsToRun` must return the CONCRETE test file path(s) to rerun; if it returns nothing, Vitest's watcher
(`packages/vitest`'s own `node_modules/vitest/dist/chunks/cli-api.*.js`, `getTestFilesFromWatcherTrigger`)
falls through to the module-graph check that already misses `.feature` files, so the trigger accomplishes
nothing. Two questions this raises are exactly what the roadmap bullet left open:

1. Since a `.feature` file is data, not a module, there is no static import graph linking it to the
   `.steps.test.ts` (or equivalently named) file that calls `loadFeature` on it — `defineSteps` reuse
   (ADR-EC-027) means the relationship is not even necessarily one file to one file. What does
   `testsToRun` return?
2. `watchTriggerPatterns` is root-only config (`NonProjectOptions`, confirmed against the same installed
   types) — the roadmap bullet already knew this and stated the one-line-in-root-config cost; nothing new
   here beyond confirming it against the real API rather than the docs description.

## Decision

`gherkinWatchTriggers(pattern, options?)` returns a Vite `Plugin` (imported as `Plugin` from
`"vitest/config"`, not a new `vite` dependency — `vitest/config` already re-exports it from `vite`, and
`vitest` is already a peer dependency this package needs anyway) whose `config()` hook appends ONE
`WatcherTriggerPattern` to `test.watchTriggerPatterns`:

```ts
{
  pattern: /\.feature$/,
  testsToRun: (id) => {
    if (!trackedFeatureFiles().has(toPosix(id))) return
    return globSync(testInclude, { cwd, onlyFiles: true }).map((file) => path.resolve(cwd, file))
  }
}
```

`pattern` is a broad, cheap filter (any changed file ending `.feature`); `trackedFeatureFiles()` — the
SAME `globSync` call `gherkinTags` already runs against the SAME caller-supplied pattern — is the real
membership test, so a `.feature` file outside the caller's own glob is correctly ignored. On a genuine
match, **`testsToRun` reruns every test file matching the consumer's own `test.include`** (captured from
the config object the plugin's `config()` hook itself receives, falling back to Vitest's documented
default `**/*.{test,spec}.?(c|m)[jt]s?(x)` when `test.include` isn't visible there), rather than
attempting to name the one specific file that consumes the changed `.feature`.

**This is the central decision, and it trades precision for correctness.** Three narrower alternatives
were considered and rejected:

- **Naming-convention sibling swap** (`<name>.feature` → `<name>.steps.test.ts`, the shape Vitest's own
  ecosystem examples for `watchTriggerPatterns` typically show for a genuinely 1:1 asset). Rejected:
  this repository's OWN acceptance suite happens to follow that convention, but nothing in
  `describeFeature`/`loadFeature`'s public contract requires it — a consumer is free to name their step
  module anything, load multiple `.feature` files from one module, or reuse step definitions across
  Features via `defineSteps` (ADR-EC-027). A convention-based mapping would SILENTLY miss a rerun for
  any consumer not following this repository's own naming, which is worse than the module-graph gap
  this plugin exists to close — a `.feature` edit that reruns nothing is at least consistently wrong.
- **A second "which test files" glob argument.** Rejected on the SIGNATURE the roadmap bullet already
  committed to: "appending the same glob `gherkinTags(...)` already consumes" — one argument, mirroring
  `gherkinTags`'s own shape. A second required glob would also duplicate information the consumer's own
  `test.include` already states.
- **Capturing the live `Vitest` instance via the `configureVitest` plugin hook** (real, confirmed against
  the installed types: `interface Plugin { configureVitest?: (context: VitestPluginContext) => void }`,
  where `context.vitest.state.getFilepaths()` returns exactly the test files Vitest has itself already
  discovered — the SAME set its own module-graph fallback reruns for an ordinary shared-dependency
  change). This is the more precise alternative and is recorded here rather than dismissed: it would
  rerun exactly what Vitest itself would already consider "possibly affected" by an untracked change,
  with no risk of `test.include` drifting from what Vitest actually resolved. It was not pursued for v1
  because it pulls in `VitestPluginContext` — a type reached through an internal chunk path, not a
  stable top-level `vitest/config` export — for a precision gain over the chosen approach that is real
  but marginal (both approaches rerun the "affected" set at file-glob granularity, not Scenario
  granularity). A future revision may switch to it without changing `gherkinWatchTriggers`'s signature.

The alternative actually accepted — rerun the full `test.include` set on any tracked `.feature` change —
mirrors what Vitest's own watcher already does as ITS fallback for a non-test dependency whose specific
consumers cannot be determined (`handleFileChanged`'s own `state.getFilepaths()` branch, read out of the
same installed source): "rerun everything already known" is not a novel workaround invented here, it is
the same shape Vitest's own internals fall back to when precise correlation isn't available.

## Consequences

**Positive**:

- Correct by construction: a `.feature` file glob-matched by the caller's own pattern reliably reruns
  the suite, with no dependency on any naming convention this library does not otherwise enforce.
- No new dependency: `Plugin`, `mergeConfig` and the `test.include` typing all come from `vitest/config`,
  already a peer dependency; the `.feature`-file glob expansion reuses `tinyglobby`, already a runtime
  dependency of this package for `gherkinTags`.
- Composes additively as designed: `mergeConfig` (confirmed against the installed `vite`) concatenates
  array-valued config fields, so `watchTriggerPatterns` contributed by this plugin, by a consumer's own
  config, and by any other plugin all survive side by side.

**Negative**:

- Conservative rather than precise: any tracked `.feature` file changing reruns the WHOLE matched test
  suite, not only the specific test(s) that load it — more work per keystroke than an ideal per-file
  correlation would do, though no more than Vitest's own generic dependency-change fallback already does
  in the case it cannot correlate precisely either.
- `test.include` is captured from whatever the config object looks like at THIS plugin's own `config()`
  hook invocation. If a consumer's `test.include` is itself set by a plugin that runs AFTER this one
  (rather than declared directly in `defineConfig({...})`, the common case), this plugin falls back to
  Vitest's documented default glob instead of the consumer's real one — stated here rather than hidden,
  matching this repository's own precedent for documenting a real cost plainly (ADR-EC-018's shared-tier
  live-clock note, ADR-EC-023's spike-cost note).
- Root-only, like `test.tags`/`gherkinTags` before it: `watchTriggerPatterns` is absent from Vitest's
  per-workspace-project config surface (`NonProjectOptions`, confirmed against the installed types), so
  a consumer using workspace projects still adds this plugin to their ROOT `vitest.config.ts`, not a
  project's own config — the same one-line cost `gherkinTags` already asks for, restated here because
  the roadmap bullet already named it and this ADR is where the confirmation belongs.

**Trade-off accepted**: correctness (never silently missing a rerun) over precision (rerunning only the
minimal necessary set), because a `.feature`-to-test-file mapping this library could rely on in general
does not exist — inventing one out of a naming convention this repository's own acceptance suite happens
to follow, but never requires of a consumer, would trade a visible, total gap (no rerun at all, today's
behavior) for an invisible, partial one (a rerun that looks like it worked but silently excluded the one
file that mattered).
