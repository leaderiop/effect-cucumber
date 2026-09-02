# Research: oxlint/ESLint custom-rule distribution options for LINT-01

> Resolves GitHub issue [#15](https://github.com/leaderiop/effect-cucumber/issues/15)
> (part of the wayfinder map, issue #11), feeding the downstream design
> ticket #16 (blocked on this one).

This is a survey, not a decision. It answers the four questions LINT-01
(`spec/roadmap.md`, `## Planned`) leaves open about what a **consumer-facing**
version of `scripts/verify-acceptance-ref-state.sh` / INV-EC-006 enforcement
could look like. No recommendation is made here.

## Method

Read this repo's own oxlint config and vendored plugin (`.oxlintrc.json`,
`tools/oxlint/effect/`, `scripts/verify-oxlint-plugin.sh`) as a primary
source — this repo is already dogfooding the exact plugin mechanism in
question. Cross-checked that against oxc's own docs site (oxc.rs) and the
`oxc-project/oxc` GitHub repo (changelog, a maintainer discussion thread) for
the mechanism's documented stability. Read `@typescript-eslint`'s own
custom-rule authoring docs and two concrete prior-art rules (one ESLint core
rule, one third-party custom rule) for question 2. Read
`scripts/verify-acceptance-ref-state.sh` in full for question 3.

---

## 1. Does oxlint support user-authored custom rules today?

**Yes — via a JS/TS plugin API, and this repo already uses it.**

This repo's own `.oxlintrc.json` (repo root) already loads a **hand-authored**
plugin:

```json
"jsPlugins": [
  { "name": "effect", "specifier": "./tools/oxlint/effect/index.ts" }
]
```

`tools/oxlint/effect/index.ts` exports a plugin object (`{ meta, rules }`)
whose rules (`tools/oxlint/effect/rules/no-bigint-literals.ts`, etc.) are
written in exactly the ESLint `create(context)` visitor shape — e.g.
`no-bigint-literals.ts`:

```ts
import type { CreateRule, Visitor } from "@oxlint/plugins"

const rule: CreateRule = {
  meta: { type: "problem", docs: { description: "..." }, fixable: "code" },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "bigint") {
          context.report({ node, message: "...", fix: (fixer) => ... })
        }
      }
    } as Visitor
  }
}
export default rule
```

`package.json` (root) pins the plugin-authoring type package directly:
`"@oxlint/plugins": "1.80.0"`, alongside `"oxlint": "1.80.0"`. And
`scripts/verify-oxlint-plugin.sh` is a mutation-proof gate (positive control:
a compliant import lints clean; negative control: a barrel import fails
naming `effect(no-import-from-barrel-package)`) that asserts this plugin is
actually loaded and enforced, not just present — i.e. this repo has already
answered "does it work" for itself, empirically, on oxlint 1.80.0.

Cross-checking against upstream:

- **oxc.rs docs**, "Writing JS Plugins"
  (https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html): rules
  are authored with the same `create(context)` → visitor-object shape shown
  above; `jsPlugins` in `.oxlintrc.json` is the documented config surface
  (`"jsPlugins": ["./plugin.js"]`, with rules enabled under
  `"rules": { "<plugin-name>/<rule-name>": "error" }`); TypeScript rule
  authoring is supported (an `oxlint.config.ts` TS-native config form exists
  alongside JSON); and the doc explicitly frames the API as ESLint-compatible:
  *"All APIs should behave identically to ESLint. If you find any
  differences in behavior, that's a bug — please report it."* It also flags
  one concrete gotcha: *"IMPORTANT: `before` hook is NOT guaranteed to run on
  every file."*
- **oxc.rs blog**, "Oxlint JS Plugins Alpha" (2026-03-11,
  https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha): this is the
  **explicit current stability statement** — *"JS plugins are currently in
  alpha, and remain under active development."* The post frames alpha as the
  point where *"JS plugins are ready for adoption in real world projects,"*
  citing 100% pass rates on ESLint's own 33,006 built-in-rule conformance
  tests and high pass rates against major plugins (React Hooks 100%, Testing
  Library 100%, ESLint Stylistic 99.99%). It also lists explicit **known
  limitations**: no custom **type-aware** rules yet, limited support for
  non-JS/TS file formats (Svelte, Vue, Angular), and a noted Windows
  performance issue. The predecessor state (before this alpha) was a
  "technical preview" (October 2025,
  https://oxc.rs/blog/2025-10-09-oxlint-js-plugins.html) and then a further
  "preview" release — so the progression is preview → alpha, not yet
  "stable"/GA.
- **`oxc-project/oxc` changelog**
  (https://github.com/oxc-project/oxc/blob/main/npm/oxlint/CHANGELOG.md)
  shows active, recent churn on this exact surface: `Add defineRule API`,
  `Move custom JS plugin config to jsPlugins` (i.e. the config key this repo
  uses was itself renamed at some point), and `Rename
  --experimental-js-plugins to --js-plugins` — the CLI flag's own name
  history (`--experimental-...` → `--js-plugins`) is further evidence this
  landed as an experimental feature that has since matured to alpha, not that
  it was always the stable, documented path.
- **`oxc-project/oxc` GitHub Discussion #20086**, "Can I define custom rules
  with oxlint?" (https://github.com/oxc-project/oxc/discussions/20086,
  2026-03-06): a user asks exactly this repo's question 1 — custom rules not
  in any published plugin. Maintainer `camc314` answers by pointing at the
  JS-plugins doc and confirms ("yes exactly") that custom rules must be
  authored as a plugin. A later reply in the same thread also confirms
  plugins in a **non-JS language are not supported** — only JS/TS plugins
  (optionally calling out to Rust via napi) are possible.

**Bottom line for Q1:** oxlint is not limited to its built-in rule set plus a
fixed list of known vendored/plugin packages — it has a real, ESLint-shaped
plugin API (`jsPlugins` + `@oxlint/plugins` types) that lets anyone author
and load their own rule, in JS or TS, from a local file or an npm package.
This repo is proof it works today at oxlint 1.80.0. The one honest caveat,
stated by oxc itself, is that the mechanism is labeled **alpha**, not
stable/GA, and does not yet support **type-aware** custom rules (pure
AST/scope rules — which is what an INV-EC-006-style check is — are
unaffected by that specific limitation).

---

## 2. What would an `@typescript-eslint`-style custom rule look like for this pattern, and is it well-trodden?

**Yes, this is a well-trodden ESLint/TS-ESLint custom-rule shape — an AST
visitor over `VariableDeclaration`/scope, not a novel technique — and there
is direct prior art for the "closure over a mutable binding inside a
callback" pattern specifically.**

`@typescript-eslint`'s own custom-rule docs
(https://typescript-eslint.io/developers/custom-rules) describe the
recommended authoring path as `ESLintUtils.RuleCreator` (a thin wrapper that
adds typed message IDs over plain ESLint rule authoring), built on the same
visitor-object shape (`FunctionDeclaration(node)`, etc., typed against the
`TSESTree` AST namespace) as vanilla ESLint/oxlint rules. Where a rule needs
actual TypeScript **type** information (not just syntax), it calls
`ESLintUtils.getParserServices(context)` to reach the type checker — but a
rule that only asks "is this a `let`/`var` declared inside this callback,
and is it referenced from a nested function" needs no type information at
all, only scope analysis, so this pattern doesn't need the type-aware half
of `@typescript-eslint`'s API — which matters because that is exactly the
half oxlint's JS-plugin alpha does not support yet (see Q1).

Concretely, a rule for this pattern would:

1. Visit the `CallExpression` for `Scenario(...)`/`Rule(...)`/`Background(...)`
   (matched by callee name, same as this repo's own step-registration
   conventions).
2. Within its callback argument, walk `VariableDeclaration` nodes and record
   any `let`/`var` (not `const`) declared at that scope, using the rule
   context's scope manager (`context.sourceCode.getScope(node)` in modern
   ESLint/oxlint, or `context.getScope()` in older ESLint) to resolve each
   binding's references.
3. For each declared `let`/`var`, check whether any of its resolved
   references occur inside a **nested function** (a step-definition
   callback) rather than directly in the outer `Scenario`/`Rule`/`Background`
   callback body — i.e. the same "does a function nested inside a loop close
   over a variable declared outside it" logic ESLint's own `no-loop-func`
   rule already implements, just with the loop body replaced by
   `Scenario`/`Rule`/`Background`'s callback.
4. Report at the declaration site if any reference is found inside a nested
   step callback.

**Prior art, not hypothetical:**

- **ESLint core's own `no-loop-func`** rule
  (https://eslint.org/docs/latest/rules/no-loop-func; introduced in
  ESLint v0.0.9) is exactly this shape already, shipped and maintained in
  ESLint core: it disallows a function *inside a loop* that contains "unsafe
  references to modified variables from the outer scope," explicitly
  treating `let`/`const`-scoped-per-iteration bindings as safe and `var`
  (function-scoped, shared across iterations) as the unsafe case. It is the
  closest built-in analog to "a callback that closes over a mutable
  binding is unsafe" — swap "loop" for "Scenario/Rule/Background callback."
  Its documented limitation — it "cannot identify whether the function
  instance is just immediately invoked and then discarded, or possibly
  stored for later use" — is a real precedent for the kind of false-positive
  a Scenario-scoped version would also have to accept or special-case.
- **`aws/aws-durable-execution-sdk-js` PR #252**
  (https://github.com/aws/aws-durable-execution-sdk-js/pull/252) adds a
  custom ESLint rule, `no-closure-in-durable-operations`, that is a much
  closer domain analog than `no-loop-func`: it targets four specific
  callback-taking functions (`step`, `runInChildContext`,
  `waitForCondition`, `waitForCallback` — the durable-execution equivalents
  of this repo's `Scenario`/`Rule`/`Background`), allows *reading* a closed-
  over variable but flags *mutating* it (`=`, compound assignment, `++`/
  `--`), and "recursively tracks variable declarations across nested
  scopes" to tell closure-scope variables from function-local ones. Its
  stated rationale — durable operations must be deterministic across
  retries/replays, and a mutated closure variable breaks that — is the same
  failure mode INV-EC-006 exists to prevent for retried Scenarios ("a
  closure variable passes on a clean run and leaks across retries," per
  `scripts/verify-acceptance-ref-state.sh`'s own header comment). Its
  documented gaps (property mutation on an object/array isn't caught,
  destructuring assignments slip through, performance on very large
  callbacks) are also directly relevant caveats for a from-scratch version
  of this rule.

**Bottom line for Q2:** this is not a hard or unusual rule to write — it's a
standard AST-visitor-plus-scope-manager rule with one core-ESLint precedent
(`no-loop-func`) and one close third-party domain precedent
(`no-closure-in-durable-operations`) already doing nearly this exact check.
Since it needs no type information, it would run equally well as an oxlint
JS plugin rule (per Q1) or as a conventional `@typescript-eslint`-style
ESLint rule.

---

## 3. Is a standalone, parameterized verify-script a real third option?

**Yes — `scripts/verify-acceptance-ref-state.sh` is mostly generic already;
only a handful of lines are this-repo-specific.**

Reading the script in full
(`scripts/verify-acceptance-ref-state.sh`, repo root), its logic splits
cleanly into generic and repo-specific parts:

**Repo-specific (would need to become parameters/flags for a consumer):**

- `ACCEPTANCE_DIR="packages/vitest/test/acceptance"` — the directory to
  scan. Trivially a `$1`/flag.
- `CONTROL_FILE="packages/vitest/src/Runner.ts"` and `MIN_STEP_MODULES=5` —
  this repo's own **positive controls** (assertion 1 proves the scan reaches
  a nonzero population of `*.steps.test.ts` files; assertion 2 proves the
  `let`/`var` regex still matches something real, using a known file in
  *this* package as ground truth). A consumer has no `packages/vitest/src/
  Runner.ts` and a different step-module naming convention, so these two
  controls specifically need to become "point this at any file of yours with
  a known `let`" and "point this at your own step-glob" parameters — this is
  the part requiring real generalization work, not just path substitution,
  because the whole point of the controls is to prove the scan isn't
  silently scanning nothing (the script's own comments are explicit about
  this: *"the population control ... [prevents assertions] 3 and 4 [from]
  otherwise ... passed by scanning nothing"*).
- `ALLOWED_MUTATIONS=3` and the `GATE-ALLOW-MUTATION` carve-out count — this
  repo's own current carve-out count. Trivially becomes a parameter (or is
  dropped for a consumer template that starts at 0 and lets them raise it).
- The `*.steps.test.ts` filename convention (used both to count modules for
  the population control and, via `SCANNED_TS` finding all `*.ts` files
  under `ACCEPTANCE_DIR`, to know what to scan) is this repo's own pairing
  convention (`README.md`'s "a `*.steps.ts` is collected by nothing" note,
  quoted in the script's own fail message) — a consumer's step modules may
  not follow this suffix at all, so the file-selection glob is also a
  parameter, not a constant.

**Already generic (would port with zero logic change):**

- The core regex machinery: `DECLARATION_RE` (matches `let`/`var`
  declarations, comment-line-aware via `COMMENT_RE`), `MUTATOR_RE` (matches
  `.push`/`.pop`/`.shift`/`.unshift`/`.splice`/`.sort`/`.reverse`/`.fill`
  in-place mutator calls), `ALLOW_MARKER_RE` (the `// GATE-ALLOW-MUTATION:
  <reason>` carve-out syntax), and the `scan()` helper that strips comment
  lines before matching. None of this is Effect-cucumber-specific — it's a
  generic "no `let`/`var`, no in-place mutation, unless explicitly marked"
  scanner over any directory of TypeScript files.
- The overall assertion structure (population control → regex control →
  declaration gate → mutator gate → carve-out count check → pass) is a
  reusable template shape, independent of what directory or filenames it
  targets.

**Caveat inherent to the approach, not this script specifically:** like the
current script, a generalized version would still be a textual/regex scan,
not a real AST-and-scope analysis — it flags *any* `let`/`var` anywhere in a
scanned file (a script-level module constant, a `let` inside an unrelated
helper function in the same file), not specifically "a `let` declared inside
a `Scenario`/`Rule`/`Background` callback that a step closes over," which is
a coarser (over-broad but zero-runtime-dependency) approximation of what
either lint-rule option (Q1/Q2) could check precisely via real scope
analysis.

**Bottom line for Q3:** yes, this is a real, low-effort option. Roughly
80% of the script (all the regex/comment/carve-out machinery and the
assertion pipeline) is already directory-agnostic; the remaining ~20% (the
two positive-control targets, the file-selection glob, and the carve-out
count) would need to become consumer-supplied parameters or documented
placeholders in a copyable template. No new tooling dependency is required
— it's `bash` + `grep`, same as today.

---

## 4. Can oxlint and ESLint coexist / be dual-targeted in a consumer's project?

**Yes — coexistence is the documented, common case, not an edge case, so
"pick one linter" is not obviously the right framing for LINT-01.**

- oxc's own docs and ecosystem guidance describe oxlint as designed to run
  *alongside* ESLint rather than replace it outright: the commonly cited
  pattern is "oxlint as a fast first pass, ESLint for rules oxlint doesn't
  (yet) support," including for large/complex codebases doing an incremental
  migration.
- `oxc-project/eslint-plugin-oxlint`
  (https://github.com/oxc-project/eslint-plugin-oxlint) exists specifically
  to support this dual-run setup: it's an ESLint config preset (in the
  spirit of `eslint-config-prettier`) that turns off ESLint rules already
  covered by oxlint, so the two tools' rule sets don't fight or double-run
  the same check.
- oxlint's one real coexistence constraint is narrower than "can't run both
  tools" — only one oxlint *config file* per directory (JSON vs. TS config,
  or `oxlint.config.ts` vs. `.mts`, can't coexist with each other), which
  is a constraint on oxlint's own config loading, not on ESLint running in
  the same project.

**Bottom line for Q4:** a consumer already running oxlint as primary (as
this repo does) is not thereby prevented from also running `@typescript-
eslint` for a rule oxlint can't yet express or that they'd rather write in
the more mature ESLint custom-rule ecosystem. Framing LINT-01 as "oxlint
plugin rule OR ESLint custom rule OR verify-script" as three *mutually
exclusive* options may be the wrong framing — a consumer already on
`@typescript-eslint` for other reasons could adopt an ESLint-only custom
rule without touching their oxlint config at all, and one already on
oxlint-only (as this repo is) has the Q1 plugin path available without
adding ESLint as a second toolchain.

---

## Summary

| # | Question | Finding |
|---|----------|---------|
| 1 | Does oxlint support custom rules today? | **Yes** — ESLint-compatible JS/TS plugin API (`jsPlugins` + `@oxlint/plugins`), already used by this repo (`tools/oxlint/effect/`) at oxlint 1.80.0. Officially labeled **alpha** (oxc.rs blog, 2026-03-11), not stable/GA; no custom **type-aware** rules yet — irrelevant to this specific check, which needs only scope analysis. |
| 2 | What would a `@typescript-eslint`-style rule look like? | A standard `create(context)` AST-visitor + scope-manager rule (visit `Scenario`/`Rule`/`Background` callback → find `let`/`var` declarations → check for references inside a nested step function). Well-trodden: ESLint core's `no-loop-func` is the closest built-in precedent; `aws/aws-durable-execution-sdk-js` PR #252's `no-closure-in-durable-operations` is a near-exact domain analog (closure mutation across a callback-taking `step`/`runInChildContext`/etc. boundary). Needs no type information, so it's equally implementable as an oxlint JS plugin rule. |
| 3 | Is a generalized verify-script a real option? | **Yes.** `scripts/verify-acceptance-ref-state.sh`'s regex/comment/carve-out machinery and assertion pipeline are already directory-agnostic; only the two positive-control targets, the file-selection glob, and the carve-out count are this-repo-specific and would need to become parameters. It remains a coarser textual scan (whole-file `let`/`var`, not scope-precise), unlike either lint-rule option. |
| 4 | Can oxlint and ESLint coexist? | **Yes**, and it's the documented common pattern (`eslint-plugin-oxlint` exists specifically to support it) — so LINT-01 need not be framed as picking exactly one mechanism. |

No decision is made here on which option(s) LINT-01/#16 should pursue —
that is explicitly out of scope for this research task.
