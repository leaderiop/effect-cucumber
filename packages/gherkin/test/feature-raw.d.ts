/**
 * Vite's `?raw` query returns a module whose default export is the file's text.
 *
 * Declared here rather than by referencing `vite/client`, which would pull in every other
 * ambient Vite type this package has no use for. Nothing needs it at runtime — vitest
 * transpiles without type-checking — but the type-check over `test/**` added in plan 02-10
 * does.
 */
declare module "*.feature?raw" {
  const source: string
  export default source
}
