/**
 * Reading `.feature` bytes through `effect`'s own `FileSystem` service — the ONLY module in this package that
 * requires `FileSystem.FileSystem`, kept to one function so `parseFeature` stays filesystem-free.
 * `scripts/verify-no-runner-dep.sh` asserts no concrete platform implementation is imported under `src/`; the
 * caller supplies the Layer (`@effect/platform-node`'s `NodeFileSystem.layer` in this package's own tests).
 *
 * The path is taken verbatim: the caller chose it and runs in their own process, so a traversal guard would be
 * theatre. `NodeFileSystem.readFileString` suspends internally, so `Effect.runSync` over `loadFeature` throws
 * `AsyncFiberError` (`test/loadFeature.test.ts`); run it with `Effect.runPromise`.
 */
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import type * as PlatformError from "effect/PlatformError"
import { LoadFeatureError, type LoadFeatureErrorReason } from "./Errors.ts"

/** The `PlatformError`'s own discriminant decides the reason: `NotFound` → `MissingFile`, `PermissionDenied` →
 * itself, anything else → `ReadFailed`, with the platform error as `cause`. Nothing is inferred from message text. */
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
