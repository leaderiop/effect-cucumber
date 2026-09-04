/**
 * Tests for `RerunManifest.ts` (ADR-EC-038, BEH-EC-030): `readRerunManifest`, which degrades to
 * `null` ("no filter") for three distinct reasons — only two of which warn — and
 * `defaultRerunManifestPath`. `readRerunManifest` is pure `node:fs` + `JSON.parse`, so this file uses
 * a plain `it` throughout, never `it.effect`, and `assert`, never `expect` (`AGENTS.md` §5).
 *
 * The `console.warn` spy below follows the house pattern `emission.test.ts` already established: a
 * direct `globalThis.console.warn` reassignment inside a `try`/`finally`, restored unconditionally,
 * with the original captured up front so the restore can be asserted BY REFERENCE.
 */
import { assert, describe, it } from "@effect/vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defaultRerunManifestPath, readRerunManifest } from "../src/RerunManifest.ts"

// Captured before anything below installs a stub, so the restore assertion can compare by IDENTITY.
const originalConsoleWarn = globalThis.console.warn

// Run `thunk` with `console.warn` recording into a fresh array, and hand back both the array and the
// thunk's own return value.
const recordWarnings = <A>(
  thunk: () => A
): { readonly result: A; readonly warnCalls: ReadonlyArray<ReadonlyArray<unknown>> } => {
  const warnCalls: Array<ReadonlyArray<unknown>> = []
  const original = globalThis.console.warn
  globalThis.console.warn = (...args: Array<unknown>) => {
    warnCalls.push(args)
  }
  try {
    const result = thunk()
    return { result, warnCalls }
  } finally {
    globalThis.console.warn = original
  }
}

describe("defaultRerunManifestPath", () => {
  it("is the documented `.effect-cucumber/rerun-manifest.json`", () => {
    assert.strictEqual(defaultRerunManifestPath, ".effect-cucumber/rerun-manifest.json")
  })
})

describe("readRerunManifest", () => {
  it("returns null with NO warning when the file does not exist yet — the ordinary first-run case", () => {
    const { result, warnCalls } = recordWarnings(() =>
      readRerunManifest(join(tmpdir(), "effect-cucumber-rerun-manifest-does-not-exist.json"))
    )
    assert.strictEqual(result, null)
    assert.strictEqual(warnCalls.length, 0)
  })

  it("returns null and warns once when the file exists but is not valid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      writeFileSync(path, "{ not valid json", "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.strictEqual(result, null)
      assert.strictEqual(warnCalls.length, 1)
      const printed = String(warnCalls[0]?.[0])
      assert.ok(printed.includes("MalformedRerunManifest"))
      assert.ok(printed.includes(path))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns null and warns once for `{}` — valid JSON, wrong shape (no `failed` field)", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      writeFileSync(path, "{}", "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.strictEqual(result, null)
      assert.strictEqual(warnCalls.length, 1)
      assert.ok(String(warnCalls[0]?.[0]).includes("MalformedRerunManifest"))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns null and warns once for `{\"failed\": \"not an array\"}` — wrong shape (a string, not an array)", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      writeFileSync(path, JSON.stringify({ failed: "not an array" }), "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.strictEqual(result, null)
      assert.strictEqual(warnCalls.length, 1)
      assert.ok(String(warnCalls[0]?.[0]).includes("MalformedRerunManifest"))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns null and warns once for `{\"failed\": [1, 2, 3]}` — an array of the wrong element type", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      writeFileSync(path, JSON.stringify({ failed: [1, 2, 3] }), "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.strictEqual(result, null)
      assert.strictEqual(warnCalls.length, 1)
      assert.ok(String(warnCalls[0]?.[0]).includes("MalformedRerunManifest"))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns the exact expected Set, with NO warning, for a real valid manifest file", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      const failed = ["a.feature::::Scenario one", "b.feature::My Rule::Scenario two"]
      writeFileSync(path, JSON.stringify({ failed }), "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.deepStrictEqual(result, new Set(failed))
      assert.strictEqual(warnCalls.length, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns an empty Set, with no warning, for a valid manifest whose `failed` array is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "effect-cucumber-rerun-manifest-"))
    const path = join(dir, "manifest.json")
    try {
      writeFileSync(path, JSON.stringify({ failed: [] }), "utf8")
      const { result, warnCalls } = recordWarnings(() => readRerunManifest(path))
      assert.deepStrictEqual(result, new Set())
      assert.strictEqual(warnCalls.length, 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("restored the original console.warn, by reference, after every case above", () => {
    assert.strictEqual(globalThis.console.warn, originalConsoleWarn)
  })
})
