/**
 * A tiny, real, importable module whose only job is to be `vi.mock`'d by `ViMockHoisting.test.ts`
 * — small enough that mocking it exercises nothing but the hoisting mechanics themselves.
 */
export const greet = (name: string): string => `real:${name}`
