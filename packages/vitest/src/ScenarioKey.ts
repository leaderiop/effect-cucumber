/**
 * The `scenarioLayers` map key for `(ruleId, name)`, shared by the writer (`Collect.ts`) and the
 * reader (`Runner.ts`) so the two cannot drift.
 */

/**
 * @param ruleId - the enclosing Rule's id, or `null` for a Scenario declared at Feature level
 * @param name - the UN-INTERPOLATED Scenario name, i.e.
 */
export const scenarioKey = (ruleId: string | null, name: string): string => `${ruleId ?? "<feature>"}\u0000${name}`
