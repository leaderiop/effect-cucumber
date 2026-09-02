# Research: Vite's watch API for path-loaded `.feature` files

> Resolves GitHub issue [#19](https://github.com/leaderiop/effect-cucumber/issues/19)
> (child of the wayfinder map, issue #11; blocks issue #20).

## Method

Installed this repo's actual pinned dependency tree with `pnpm install
--frozen-lockfile` (nothing was pre-installed in this worktree) and read the
literal installed source/types directly out of `node_modules/.pnpm` — no
version assumed from memory. Confirmed the pin trail first:

- `pnpm-workspace.yaml`'s catalog pins `vitest: ^4.1.0`.
- `pnpm-lock.yaml` resolves that to `vitest@4.1.11`, which itself resolves
  `vite@8.2.2` (`pnpm-lock.yaml:67,92,117` list
  `vite@8.2.2(@types/node@...)(yaml@2.9.0)` as `vitest@4.1.11`'s dependency).
- Installed locations used below:
  - `node_modules/.pnpm/vite@8.2.2_@types+node@26.4.0_yaml@2.9.0/node_modules/vite`
  - `node_modules/.pnpm/vitest@4.1.11_@types+node@26.4.0_@vitest+coverage-v8@4.1.11_vite@8.2.2_@types+node@26.4.0_yaml@2.9.0_/node_modules/vitest`

Read Vite's compiled dev-server source (`dist/node/chunks/node.js`) and its
shipped `.d.ts` (`dist/node/index.d.ts`) for the plugin-hook question, then
Vitest's own compiled watcher (`dist/chunks/cli-api.CnMVyzaz.js`) and its
`.d.ts` (`dist/chunks/reporters.d.DtoKVV2s.d.ts`) for the rerun-scheduling
question, then cross-checked the one public config option that turned out to
matter (`watchTriggerPatterns`) against its live page on vitest.dev to get
the version it landed in, since that isn't recorded in the shipped package.

**Headline finding, ahead of the detail:** the roadmap's framing ("a Vite
plugin watching the glob `gherkinTags` already declares") is half right and
half a red herring. Vite already watches the whole project root by default —
watching was never the missing piece. The missing piece is a *rerun-routing*
step that lives entirely inside Vitest, not Vite's HMR/module-graph layer,
and Vitest ships a public config option built for exactly this case. A
library-side fix is real and does not need `addWatchFile`,
`handleHotUpdate`, or `moduleGraph.invalidateModule()` at all.

---

## 1. Does Vite expose a plugin-level watch hook independent of the module graph?

**Yes — `this.addWatchFile()` (in `load`/`transform`), `configureServer` +
`server.watcher` (chokidar), and `handleHotUpdate`/`hotUpdate` all exist and
are real, typed hooks in the installed v8.2.2.** But none of them is what
closes this gap, for a reason specific to how a `.feature` file loaded via
`effect/FileSystem` behaves.

**`addWatchFile`** — found in the plugin-context implementation,
`dist/node/chunks/node.js:31113` (base `PluginContext`) and `:31232`
(`LoadPluginContext`, used inside `load`/`transform` hooks):

```js
addWatchFile(id) {
  this._container.watchFiles.add(id);
  if (this._container.watcher) ensureWatchedFile(this._container.watcher, id, this.environment.config.root);
}
```

`ensureWatchedFile` (`node.js:2508`) just calls chokidar's `watcher.add(...)`
if the file exists and isn't already under the watched root. It does **not**
touch `moduleGraph.fileToModulesMap` — confirmed by reading the only place
that map is populated, `EnvironmentModuleGraph._ensureEntryFromUrl`
(`node.js:34930-34955`), which only runs when a module is actually resolved
through Vite's `resolveId`/import pipeline. A file added only via
`addWatchFile` (or `server.watcher.add()`) is watched by chokidar, but it is
still a stranger to the module graph.

**Why that matters:** Vite's dev server already watches the *entire project
root* by chokidar default, module graph or not —
`dist/node/chunks/node.js:26398-26411`:

```js
const watcher = serverConfig.watch !== null ? import_chokidar.watch([
  ...config.experimental.bundledDev ? [] : [root],
  ...config.configFileDependencies,
  ...getEnvFilesForMode(config.mode, config.envDir),
  ...publicDir && publicFiles ? [publicDir] : []
], resolvedWatchOptions) : createNoopWatcher(resolvedWatchOptions);
```

So a `.feature` file living anywhere under the project root (and not
excluded by `resolveChokidarOptions`'s ignore rules — `node_modules`, `.git`,
build output) is **already** raising a raw chokidar `change` event today,
with zero plugin code. `addWatchFile`/`server.watcher.add()` would be a
no-op in the common case; they matter only if a `.feature` file sits outside
the watched root or inside an ignored path.

**`handleHotUpdate`/`hotUpdate`** — real hook, found in the type
declarations (`dist/node/index.d.ts:3085`) and driven by
`handleHMRUpdate()` (`dist/node/chunks/node.js:27000`). Its job is to decide
which **browser-facing HMR module** update to push over the client
WebSocket. It receives the changed file's already-resolved `ModuleNode`s
(via `environment.moduleGraph.getModulesByFile(file)`,
`node.js:27043/27051`) and can override that list — but that override still
flows into `updateModules()` (`node.js:27134`), whose entire body
(`propagateUpdate`, `moduleGraph.invalidateModule`, `hot.send({type:
"update"|"full-reload"})`) is HMR-for-a-browser-client machinery. Vitest does
not run tests through this WebSocket HMR channel (see §4) — a `hotUpdate`
hook returning a synthetic `ModuleNode` for the `.steps.test.ts` file could,
in principle, be made to work by fabricating a module node the graph never
actually created, but it would be fighting Vite's browser-oriented HMR
protocol to simulate an effect (a scheduled rerun) Vitest already exposes
directly as public API (§2).

**Verdict on Q1:** the hooks exist and are exactly as documented, but they
solve "push an HMR update to a connected client for a resolved module" — a
problem this repo doesn't have, because (a) the file is watched already, and
(b) Vitest's rerun decision doesn't run through Vite's HMR client protocol.

---

## 2. Could `@effect-cucumber/vitest` ship a plugin to fix this? Is `addWatchFile` + `server.watcher.add()` enough, or does it need `moduleGraph.invalidateModule()`?

**Neither.** The real mechanism is a Vitest-native config option,
`test.watchTriggerPatterns`, and a library-shipped Vite plugin can populate
it through the ordinary `config()` hook. No module-graph invalidation, no
HMR simulation, no `addWatchFile` required for files already under the
watched root.

**Where it plugs in:** Vitest layers its own watcher on top of Vite's
*same* chokidar instance — `VitestWatcher.registerWatcher()`
(`vitest/dist/chunks/cli-api.CnMVyzaz.js:12890-12900`):

```js
registerWatcher() {
  const watcher = this.vitest.vite.watcher;   // <- Vite's own dev-server watcher, not a second one
  if (this.vitest.config.forceRerunTriggers.length) watcher.add(this.vitest.config.forceRerunTriggers);
  watcher.on("change", this.onFileChange);
  watcher.on("unlink", this.onFileDelete);
  watcher.on("add", this.onFileCreate);
  ...
}
```

On every chokidar `change` event, `onFileChange`
(`cli-api.CnMVyzaz.js:12926-12931`) runs, in order:

```js
onFileChange = (id) => {
  id = slash(id);
  this.vitest.logger.clearHighlightCache(id);
  this.vitest.invalidateFile(id);
  if (this.getTestFilesFromWatcherTrigger(id)) this.scheduleRerun(id);
  else if (this.handleFileChanged(id)) this.scheduleRerun(id);
};
```

- `getTestFilesFromWatcherTrigger(id)` (`:12905-12924`) checks
  `this.vitest.config.watchTriggerPatterns` — an array of
  `{ pattern: RegExp; testsToRun: (file, match) => string[] | string | null
  | undefined | void }`. If `pattern` matches the changed file, `testsToRun`
  is called and its return value is added straight to `this.changedTests`,
  then `scheduleRerun(id)` fires the registered rerun callback
  (`_onRerun.forEach(cb => cb(file))`, `:12905-12907`). **No module graph
  lookup happens on this path at all.**
- Only if that returns `false` does it fall through to
  `handleFileChanged(filepath)` (`:12981-13020`), which is the module-graph
  path: it calls `moduleGraph.getModulesByFile(filepath)?.size` on every
  project's Vite environments and bails (`return false`) if that's empty —
  exactly the case for a `.feature` file that was only ever read through
  `effect/FileSystem`, never resolved as an import. This is the literal
  mechanism behind the measured-FALSE gap: the fallback path Vitest uses
  when there's no `watchTriggerPatterns` match requires module-graph
  membership, and a `FileSystem.readFileString` call never grants it —
  `addWatchFile` doesn't grant it either, confirmed in §1.

**`watchTriggerPatterns` is public, documented, typed, and built for this
exact scenario.** Type declaration,
`vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:2938-2942`:

```ts
/**
* Pattern configuration to rerun only the tests that are affected
* by the changes of specific files in the repository.
*/
watchTriggerPatterns?: WatcherTriggerPattern[];
```
```ts
interface WatcherTriggerPattern {
  pattern: RegExp;
  testsToRun: (file: string, match: RegExpMatchArray) => string[] | string | null | undefined | void;
}
```
(`reporters.d.DtoKVV2s.d.ts:1211-1214`)

Its own docs page, <https://vitest.dev/config/watchtriggerpatterns> (fetched
live, since the shipped package carries no changelog), states it was added
in **vitest 3.2.0+** — well below this repo's `vitest@4.1.11` pin — and
describes the use case verbatim as this issue's problem:

> This configuration option allows you to define custom patterns for
> triggering test reruns when Vitest cannot automatically detect
> dependencies through static or dynamic imports. This is particularly
> useful when tests read from the file system or fetch from external
> sources.

with the worked example being exactly the "map a changed non-imported file
to a specific test file" shape:

```ts
watchTriggerPatterns: [
  {
    pattern: /^src\/(mailers|templates)\/(.*)\.(ts|html|txt)$/,
    testsToRun: (id, match) => `./api/tests/mailers/${match[2]}.test.ts`,
  },
],
```

**Can a library inject entries into this instead of the consumer hand-writing
them?** Yes. A Vite plugin's `config()` hook return value is deep-merged into
the resolved config by `runConfigHook()` → `mergeConfig(conf, res)`
(`vite/dist/node/chunks/node.js:37184-37200`), and Vite's `mergeConfig`
**concatenates arrays** rather than overwriting them —
`mergeConfigRecursively` (`node.js:2865-2917`):

```js
if (Array.isArray(existing) || Array.isArray(value)) {
  merged[key] = [...arraify(existing), ...arraify(value)];
  continue;
}
```

This is generic to any key on the config object, including `test.*` fields
that are Vitest's, not Vite's own — Vite's config-hook merge does not know or
care that `test` is a Vitest extension; it merges it structurally like
everything else. So a plugin returning
`{ test: { watchTriggerPatterns: [{ pattern, testsToRun }] } }` from its
`config()` hook is *additive*: it does not clobber whatever the consumer
already put in `test.watchTriggerPatterns` themselves.

**What the plugin would actually need to do**, concretely:

1. Take the same glob `gherkinTags("<glob>")` already receives
   (`packages/vitest/src/GherkinTags.ts`, which already does a synchronous
   `globSync` over that glob at config-load time — the exact same moment a
   plugin's `config()` hook runs, so reusing the expansion is cheap).
2. Build one `WatcherTriggerPattern` whose `pattern` matches any file under
   that glob (or just match on the `.feature` extension) and whose
   `testsToRun(file, match)` maps a changed `.feature` path to its
   `.steps.test.ts` file(s) by naming convention (this repo's own
   convention, per `spec/behaviors/`, is one `.feature` next to one
   `*.steps.test.ts` — so the mapping is a straightforward string
   transform, not a search). A consumer whose file layout doesn't follow a
   1:1 convention would need `testsToRun` to return every step-test file
   that plausibly calls `loadFeature` for that path — a coarser but still
   correct fallback (same shape as `forceRerunTriggers`, just scoped to
   `.feature` files instead of the whole suite).
3. Return that entry from the plugin's `config()` hook, so it merges
   additively.

None of this needs `moduleGraph.invalidateModule()` — that call
(`moduleGraph.d.ts:1080`, used inside Vite's own `updateModules()`,
`node.js:27134`) belongs to the HMR path in §1, and Vitest's own
`invalidateFile()` (`cli-api.CnMVyzaz.js:13966-13974`) already calls it as a
side effect of `scheduleRerun` — the library doesn't need to touch it
directly.

**Caveat found while reading `NonProjectOptions`:** `watchTriggerPatterns`
is listed in Vitest's `NonProjectOptions` union
(`reporters.d.DtoKVV2s.d.ts:3572`) alongside `forceRerunTriggers`, `watch`,
`shard`, etc. — options resolved once at the **root** config, not per
workspace project. The docs page states this explicitly: "This is a global
option and cannot be used within individual project configurations." A
plugin shipped by `@effect-cucumber/vitest` therefore only takes effect if
it's registered in the consumer's **root** `vitest.config.ts` (or the file
that defines a `vitest.workspace.ts`'s root project) — not silently
propagate-able into every sub-project's plugin list the way a genuinely
per-file Vite transform plugin would.

**Verdict on Q2:** yes, a real library-side fix is feasible, and it does not
need `addWatchFile` + `server.watcher.add()` at all in the common case
(files under the watched root are already watched) — it needs a `config()`
hook contributing to `test.watchTriggerPatterns`, verified to merge
additively and to be the actual code path Vitest's watcher consults before
ever asking the module graph.

---

## 3. Is this fundamentally consumer-config-only, or can the library own it?

**The library can own the mechanism; the consumer still owns one
wiring step it cannot be relieved of.** Two separate claims, kept apart on
purpose:

- **Mechanism** (the regex, the `.feature` → `.steps.test.ts` mapping, the
  `gherkinTags` glob reuse): fully library-owned. It's exactly the kind of
  logic `@effect-cucumber/vitest` already writes in `GherkinTags.ts` for a
  different config field; nothing about `watchTriggerPatterns` requires the
  *consumer* to understand Vite's module graph or Vitest's watcher
  internals — it can ship as an exported plugin, e.g.
  `gherkinWatchPlugin(glob)`, the same shape `gherkinTags(glob)` already
  takes.
- **Wiring**: the consumer still has to put that plugin in their
  `plugins: [...]` array, in the **root** vitest config specifically (per
  the `NonProjectOptions`/workspace constraint in §2) — that one line is
  irreducible, same as any other opt-in Vite plugin (there's no mechanism
  for a devDependency to auto-register itself into a consumer's Vite plugin
  list; Vite has no such discovery mechanism, and nothing in the installed
  source suggests one exists in this version).

So "fundamentally consumer-config-only" is too strong — it implies the
consumer would have to hand-write the regex/mapping logic themselves (the
`?raw` workaround's spirit), which is not true here. But "the library can do
100% of it silently" is also too strong — one line in the consumer's root
config is unavoidable, and doesn't move for a workspace/projects setup.

---

## 4. Vitest's own test-file rerun mechanics (not generic Vite HMR)

Already the backbone of §2's citations; summarized here as its own answer
since the issue explicitly asked to check this separately from Vite's HMR:

- Vitest wires its watcher to **the same chokidar instance Vite's dev
  server created**, not a second one:
  `this.vitest.vite.watcher` in `VitestWatcher.registerWatcher()`
  (`cli-api.CnMVyzaz.js:12891-12900`), and separately
  `this.watcher = new VitestWatcher(this).onWatcherRerun((file) =>
  this.scheduleRerun(file))` wired up in the `Vitest` class constructor path
  (`cli-api.CnMVyzaz.js:13104`).
- Decision order on every raw file-change event
  (`onFileChange`, `:12926-12931`):
  1. `getTestFilesFromWatcherTrigger` — consult
     `config.watchTriggerPatterns` (§2's mechanism; no module graph
     involved).
  2. `handleFileChanged` — consult
     `project._getViteEnvironments()...moduleGraph.getModulesByFile(filepath)`
     (`:12981-13020`); returns `false` immediately if no project's module
     graph has an entry for the file, which is the entire reason
     `FileSystem`-read `.feature` files never rerun today.
  3. As a coarser, always-on backstop unrelated to either of the above,
     `forceRerunTriggers` (`string[]` globs, default
     `['**/package.json/**', '**/vitest.config.*/**',
     '**/vite.config.*/**']` per <https://vitest.dev/config/forcereruntriggers>,
     also fetched live) reruns the **entire suite** on a glob match, wired
     in the same `registerWatcher()` (`watcher.add(this.vitest.config.forceRerunTriggers)`,
     `:12893`) and consulted inside `handleFileChanged` itself
     (`:12983-12986`, `pm.isMatch(filepath, this.vitest.config.forceRerunTriggers)`).
     This already works **today, with zero code changes**, as a blunt
     workaround: adding `forceRerunTriggers: ["**/*.feature"]` to this
     repo's own `vitest.config.ts` would rerun the whole suite (not just
     the affected scenario file) on any `.feature` edit. Worth naming
     explicitly since it needs no plugin and no library change at all —
     just coarser than `watchTriggerPatterns`.
- `scheduleRerun` (`:12905-12907`) is the actual trigger — a flat list of
  registered callbacks, invoked with the originating file id. It is Vitest's
  own scheduling primitive, entirely downstream of Vite's HMR/module-graph
  layer, which is why §1's HMR-hook route was the wrong layer to chase.

---

## Summary

| # | Question | Answer |
|---|----------|--------|
| 1 | Does Vite expose a module-graph-independent watch hook? | Yes (`addWatchFile`, `handleHotUpdate`/`hotUpdate`, `configureServer`+`watcher`) — all real in v8.2.2, but they target browser HMR, and the file is already watched by Vite's default root-wide chokidar watch regardless (`node.js:26398-26411`) |
| 2 | Can `@effect-cucumber/vitest` ship a plugin that fixes this? | Yes — via a `config()` hook contributing to Vitest's public `test.watchTriggerPatterns` (added vitest 3.2.0+, `reporters.d.DtoKVV2s.d.ts:2938-2942`), merged additively by Vite's own `mergeConfig` (`node.js:2865-2917`). Not via `addWatchFile`/`moduleGraph.invalidateModule()` — unnecessary and the wrong layer. |
| 3 | Is this consumer-config-only? | No, mostly — the mapping logic is fully library-ownable; only the one-line plugin registration in the consumer's *root* vitest config (workspace/projects constraint, `NonProjectOptions`) is irreducibly consumer-side. |
| 4 | What are Vitest's own rerun mechanics? | `VitestWatcher` (`cli-api.CnMVyzaz.js:12864-13030`) rides Vite's own chokidar instance; `onFileChange` tries `watchTriggerPatterns` first (no module graph), then `handleFileChanged`'s module-graph walk (the path `.feature` files fail today), with `forceRerunTriggers` as an existing, already-working, whole-suite-rerun backstop needing zero code changes. |

**Bottom line for issue #20:** a real library-side fix is feasible and does
not require touching Vite's HMR machinery at all — it's a small,
config()-hook-only plugin that appends to `test.watchTriggerPatterns` using
the same glob `gherkinTags` already consumes, plus documentation telling
consumers to add it to their *root* vitest config. `forceRerunTriggers:
["**/*.feature"]` is also worth documenting on its own as a zero-code,
today-available workaround (whole-suite rerun, coarser than the plugin
would be) for anyone who wants a fix before #20 ships anything.
