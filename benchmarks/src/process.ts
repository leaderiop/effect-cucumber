/**
 * Real child-process spawning, timed externally with `performance.now()` (ADR-EC-051). This is the
 * ONE place wall-clock time is measured — never inside the spawned process, never by trusting a
 * runner's own self-reported duration for the fairness comparison itself (each runner's JSON
 * output is still parsed for pass/fail counts, in `runners.ts`).
 */
import { spawn } from "node:child_process"
import type { CommandResult } from "./types.ts"

export interface RunCommandOptions {
  readonly cwd: string
  readonly env?: Readonly<Record<string, string>>
}

/** Spawn `command args` as a real child process and time it wall-clock, from before spawn to after exit. */
export const runCommand = (
  command: string,
  args: ReadonlyArray<string>,
  options: RunCommandOptions
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const start = performance.now()
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env === undefined ? process.env : { ...process.env, ...options.env }
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })

    child.on("error", reject)
    child.on("close", (exitCode) => {
      const wallMillis = performance.now() - start
      resolve({
        command,
        args,
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
        wallMillis
      })
    })
  })

/** Throw, with stdout/stderr embedded, if a `CommandResult` did not exit 0. */
export const assertSuccessful = (result: CommandResult): CommandResult => {
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${result.exitCode}): ${result.command} ${result.args.join(" ")}\n`
        + `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`
    )
  }
  return result
}
