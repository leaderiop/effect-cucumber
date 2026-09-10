/**
 * `GherkinJUnitReporter` (ADR-EC-060) itself, via minimal structural fakes for vitest's own
 * `TestCase`/`TestModule` — exercising every branch `scripts/verify-junit-reporter.sh`'s real
 * `vitest run` fixture cannot cheaply reach on its own (a skipped Scenario, a module with zero
 * diagnostic, an error with no stack, tag-less/annotation-less cases), so both together cover the
 * file: the fixture proves real vitest wiring works end to end, this file proves every serialization
 * branch.
 */
import * as Effect from "effect/Effect"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestAnnotation } from "vitest"
import type { TestCase, TestModule, TestResult } from "vitest/node"
import { assert, describe, it } from "../src/EffectVitest.ts"
import { GherkinJUnitReporter } from "../src/JUnitReporter.ts"

interface FakeTestCaseArgs {
  readonly fullName: string
  readonly relativeModuleId: string
  readonly tags?: ReadonlyArray<string>
  readonly result: TestResult
  readonly annotations?: ReadonlyArray<TestAnnotation>
  readonly duration?: number
}

const fakeTestCase = (args: FakeTestCaseArgs): TestCase =>
  ({
    fullName: args.fullName,
    tags: [...(args.tags ?? [])],
    module: { relativeModuleId: args.relativeModuleId },
    result: () => args.result,
    annotations: () => args.annotations ?? [],
    diagnostic: () => args.duration === undefined ? undefined : { duration: args.duration } as any
  }) as unknown as TestCase

const fakeTestModule = (relativeModuleId: string, testCases: ReadonlyArray<TestCase>, duration = 0): TestModule =>
  ({
    relativeModuleId,
    children: { allTests: () => testCases[Symbol.iterator]() },
    diagnostic: () => ({ duration }) as any
  }) as unknown as TestModule

const writeAndRead = async (testModules: ReadonlyArray<TestModule>): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "junit-reporter-test-"))
  const outputFile = join(dir, "report.xml")
  try {
    const reporter = new GherkinJUnitReporter({ outputFile })
    await reporter.onTestRunEnd(testModules)
    return await readFile(outputFile, "utf8")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe("GherkinJUnitReporter", () => {
  it.effect("a passing, untagged, unannotated TestCase produces a bare <testcase> with no children", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Scenario",
        relativeModuleId: "a.test.ts",
        result: { state: "passed", errors: undefined },
        duration: 5
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase], 5)]))
      assert.include(xml, "<testcase classname=\"a.test.ts\" name=\"Feature &gt; Scenario\" time=\"0.005000\">")
      assert.notInclude(xml, "<properties>")
      assert.notInclude(xml, "<system-out>")
      assert.notInclude(xml, "<failure")
    }))

  it.effect("a tagged TestCase gets one <property> per tag", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Tagged",
        relativeModuleId: "a.test.ts",
        tags: ["@smoke", "@slow"],
        result: { state: "passed", errors: undefined }
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(
        xml,
        "<properties><property name=\"tag\" value=\"@smoke\"/><property name=\"tag\" value=\"@slow\"/></properties>"
      )
    }))

  it.effect("an annotated TestCase renders each annotation's type and message in <system-out>", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Attaching",
        relativeModuleId: "a.test.ts",
        result: { state: "passed", errors: undefined },
        annotations: [{ type: "text/plain", message: "evidence one" } as TestAnnotation, {
          type: "notice",
          message: "evidence two"
        } as TestAnnotation]
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(xml, "<system-out>[text/plain] evidence one\n[notice] evidence two</system-out>")
    }))

  it.effect("a failed TestCase gets one <failure> per error, escaping its message/name/stack", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Failing",
        relativeModuleId: "a.test.ts",
        result: {
          state: "failed",
          errors: [{ message: "a < b & c", name: "AssertionError", stack: "AssertionError: a < b & c\n    at x" }]
        }
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(
        xml,
        "<failure message=\"a &lt; b &amp; c\" type=\"AssertionError\">AssertionError: a &lt; b &amp; c"
      )
    }))

  it.effect("a failed error with no stack falls back to its message as the <failure> body", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Failing without a stack",
        relativeModuleId: "a.test.ts",
        result: { state: "failed", errors: [{ message: "no stack here" }] }
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(xml, "<failure message=\"no stack here\" type=\"Error\">no stack here</failure>")
    }))

  it.effect("a skipped TestCase gets a bare <skipped/> element", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Skipped",
        relativeModuleId: "a.test.ts",
        result: { state: "skipped", errors: undefined, note: undefined }
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(xml, "<skipped/>")
    }))

  it.effect("a TestCase with no diagnostic yet reports time=\"0\"", () =>
    Effect.gen(function*() {
      const testCase = fakeTestCase({
        fullName: "Feature > Undiagnosed",
        relativeModuleId: "a.test.ts",
        result: { state: "pending", errors: undefined }
      })
      const xml = yield* Effect.promise(() => writeAndRead([fakeTestModule("a.test.ts", [testCase])]))
      assert.include(xml, "name=\"Feature &gt; Undiagnosed\" time=\"0\"")
    }))

  it.effect("the <testsuites> root aggregates tests/failures/time across every module", () =>
    Effect.gen(function*() {
      const passing = fakeTestCase({
        fullName: "A",
        relativeModuleId: "a.test.ts",
        result: { state: "passed", errors: undefined },
        duration: 1
      })
      const failing = fakeTestCase({
        fullName: "B",
        relativeModuleId: "b.test.ts",
        result: { state: "failed", errors: [{ message: "boom" }] },
        duration: 2
      })
      const xml = yield* Effect.promise(() =>
        writeAndRead([fakeTestModule("a.test.ts", [passing], 1), fakeTestModule("b.test.ts", [failing], 2)])
      )
      assert.include(xml, "tests=\"2\" failures=\"1\" errors=\"0\" time=\"0.003000\"")
      assert.include(
        xml,
        "<testsuite name=\"a.test.ts\" tests=\"1\" failures=\"0\" errors=\"0\" skipped=\"0\" time=\"0.001000\">"
      )
      assert.include(
        xml,
        "<testsuite name=\"b.test.ts\" tests=\"1\" failures=\"1\" errors=\"0\" skipped=\"0\" time=\"0.002000\">"
      )
    }))
})
