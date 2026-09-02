/**
 * Vite's `?raw` query returns a module whose default export is the file's text.
 */
declare module "*.feature?raw" {
  const source: string
  export default source
}
