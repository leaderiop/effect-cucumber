// A COPYABLE oxlint plugin entry, not one this repository loads against its own source. Copy this
// whole directory into your own repository and wire it into your own .oxlintrc.json — see
// README.md in this directory. Named "effect-cucumber" (not "effect": that name is reserved for
// the actual vendored Effect rules a consumer may separately be running, following the same
// unpublished-plugin, local-path-jsPlugins pattern the Effect monorepo itself uses for
// packages/tools/oxc — see tools/oxlint/effect/ATTRIBUTION.md in this repository for that
// precedent).
import refStateOnly from "./rules/ref-state-only.ts"

export default {
  meta: {
    name: "effect-cucumber"
  },
  rules: {
    "ref-state-only": refStateOnly
  }
}
