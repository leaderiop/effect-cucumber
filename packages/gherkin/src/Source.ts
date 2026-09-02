/**
 * Reading `.feature` bytes off disk, through `effect`'s own `FileSystem` service. This is the
 * ONLY module in `@effect-cucumber/gherkin` that requires `FileSystem.FileSystem`, and it
 * exists as a separate one-function module precisely so that it can stay that way.
 *
 * The reason the split is worth a file of its own: `parseFeature(source, uri)` must be usable
 * with no filesystem at all. It is the entry point a Vite `?raw` import feeds, and it is what
 * every correlation and validation test calls. Confining the single `FileSystem` requirement
 * here keeps it out of the parse pipeline entirely — `parseFeature`'s requirements stay
 * `never`. `scripts/verify-no-runner-dep.sh` asserts this package never imports a concrete
 * platform implementation (`@effect/platform-node`/`-bun`/`-deno`) or a test runner anywhere
 * under `src/`, regardless of which module would import it.
 *
 * On the path argument: it is taken verbatim. No resolution, no canonicalisation, no
 * containment check. The caller already chose the path and already runs in their own process,
 * so no privilege boundary is crossed here and a traversal guard would be security theatre
 * (threat T-02-03, dispositioned `accept`).
 *
 * ## `effect/FileSystem`, not `@effect/platform`
 *
 * [ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
 * anticipated needing `@effect/platform` as a peer dependency for this. That turned out to be
 * unnecessary: `effect` v4 moved `FileSystem`/`Path`/`PlatformError` directly into the core
 * `effect` package (confirmed by import — `effect/FileSystem` resolves with zero extra
 * dependency), so the existing `effect` peer already covers the service interface used below.
 * `@effect/platform-node`'s `NodeFileSystem.layer` — a real, published `4.0.0-rc.112` release,
 * confirmed by direct install to match this workspace's `effect` version — is what actually
 * satisfies the requirement at runtime, but only as a `devDependency` of THIS package (for its
 * own test suite; see `test/loadFeature.test.ts`). `@effect-cucumber/gherkin` itself never
 * depends on any concrete platform implementation — the caller (a runner package, or a
 * consumer's own script) supplies the Layer.
 *
 * ## `Effect.runSync` no longer works here — confirmed, not assumed
 *
 * `NodeFileSystem.readFileString` suspends internally (built on Node's async `fs` APIs, not
 * `readFileSync`) — reproduced directly against the real package: `Effect.runSync` throws
 * `AsyncFiberError` where the earlier `node:fs.readFileSync`-backed version would have
 * returned synchronously. This is the deliberate trade this migration makes: giving up
 * `loadFeature`'s `Effect.runSync`-at-module-top-level ergonomic in exchange for the
 * maintained, full-featured, real platform implementation instead of a hand-rolled
 * workaround. `test/loadFeature.test.ts` now proves PARSE-01/BEH-EC-001 through a
 * module-top-level `await`, not `Effect.runSync` — see that file's doc comment.
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import type * as PlatformError from "effect/PlatformError"
import { LoadFeatureError, type LoadFeatureErrorReason } from "./Errors.ts"

/**
 * Read a `.feature` file as UTF-8 text.
 *
 * Every filesystem failure — a missing file, a directory, a permissions error — leaves this
 * Effect failing with a `LoadFeatureError` with reason `MissingFile`. A raw `PlatformError`
 * never escapes the package; its own `.message` (already well-formatted — e.g. `"NotFound:
 * FileSystem.readFile (/path)"`, confirmed by reproduction) is folded into this package's own
 * message shape instead of re-derived from the underlying Node error code.
 */
/**
 * The `PlatformError`'s own discriminant decides the reason; nothing is inferred from message
 * text. `NotFound` is the only case that means the file is absent; a permission failure says so
 * by name; every other system or argument failure (a directory, a busy handle, a bad path) is
 * `ReadFailed`, with the platform error attached as `cause` for the detail. Before this mapping
 * existed every failure was reported as `MissingFile` (audit finding F-14).
 */
const reasonOf = (platformError: PlatformError.PlatformError): LoadFeatureErrorReason => {
  const { _tag } = platformError.reason
  if (_tag === "NotFound") return "MissingFile"
  if (_tag === "PermissionDenied") return "PermissionDenied"
  return "ReadFailed"
}

export const readFeatureSource = Effect.fn("readFeatureSource")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString(path, "utf8").pipe(
    Effect.mapError((platformError) =>
      new LoadFeatureError({
        reason: reasonOf(platformError),
        uri: path,
        line: Option.none(),
        message: `Cannot read feature file ${path}: ${platformError.message}`,
        cause: platformError
      })
    )
  )
})
