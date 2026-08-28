// Vendored from Effect-TS/effect `packages/tools/oxc` (MIT). See ATTRIBUTION.md.
//
// Deviation from upstream: the `no-unused-internal` rule is intentionally NOT
// vendored. It is the only rule that imports the `typescript` compiler API as a
// runtime value, which is what pins upstream's manifest to
// `typescript >=5.0.0 <7.0.0`. This project is on TypeScript 7, and the rule
// enforces Effect's `@internal` JSDoc + `stripInternal` convention, which
// effect-cucumber does not use. Dropping it removes the TypeScript version
// constraint entirely — every rule below is type-only against `@oxlint/plugins`.

import noBigIntLiterals from "./rules/no-bigint-literals.ts"
import noImportFromBarrelPackage from "./rules/no-import-from-barrel-package.ts"
import noJsExtensionImports from "./rules/no-js-extension-imports.ts"
import noOpaqueInstanceFields from "./rules/no-opaque-instance-fields.ts"

export default {
  meta: {
    name: "effect"
  },
  rules: {
    "no-bigint-literals": noBigIntLiterals,
    "no-import-from-barrel-package": noImportFromBarrelPackage,
    "no-js-extension-imports": noJsExtensionImports,
    "no-opaque-instance-fields": noOpaqueInstanceFields
  }
}
