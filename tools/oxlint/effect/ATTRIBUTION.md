# Vendored: Effect's oxlint rules

The contents of this directory are copied from the Effect monorepo:

- **Upstream:** https://github.com/Effect-TS/effect, `packages/tools/oxc`
- **Package name upstream:** `@effect/oxc`
- **License:** MIT (Effect Contributors) — same license as this project
- **Vendored at:** 2026-08-28, from `main`

## Why vendored instead of installed

`@effect/oxc` is marked `"private": true` in the Effect monorepo and is **not
published to npm** (`npm view @effect/oxc` returns 404). It is a
workspace-internal tool. Vendoring is the only way to obtain these rules.

## What was copied

| File                                     | Upstream path                                       |
| ---------------------------------------- | --------------------------------------------------- |
| `rules/no-bigint-literals.ts`            | `src/oxlint/rules/no-bigint-literals.ts`            |
| `rules/no-import-from-barrel-package.ts` | `src/oxlint/rules/no-import-from-barrel-package.ts` |
| `rules/no-js-extension-imports.ts`       | `src/oxlint/rules/no-js-extension-imports.ts`       |
| `rules/no-opaque-instance-fields.ts`     | `src/oxlint/rules/no-opaque-instance-fields.ts`     |
| `test/*`                                 | `test/*` (rule imports rewritten to relative paths) |
| `index.ts`                               | `src/oxlint/index.ts` (adapted — see below)         |

Rule sources are **byte-identical** to upstream. Only `index.ts` and the test
files' import specifiers were modified.

## Deliberate deviation: `no-unused-internal` is NOT vendored

Upstream ships five rules. This copy has four.

`no-unused-internal.ts` is excluded because it is the only rule that imports the
`typescript` compiler API as a **runtime value** (`import ts from "typescript"`).
That single import is why upstream's `package.json` declares:

```jsonc
"peerDependencies": { "typescript": ">=5.0.0 <7.0.0" }
```

— a range that **excludes TypeScript 7**, which this project uses. The rule also
enforces Effect's `@internal` JSDoc + `stripInternal` convention, which
effect-cucumber does not adopt.

Excluding it means every vendored rule imports only _types_ from
`@oxlint/plugins` (plus `node:fs` / `node:path`), so this directory has **no
TypeScript version constraint at all** and no runtime dependency beyond Node.

If effect-cucumber ever adopts the `@internal` convention, revisit — but check
whether upstream has widened its TypeScript peer range first.

## Rule relevance to this project

| Rule                            | Relevance                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-import-from-barrel-package` | **High.** Machine-enforces AGENTS.md §3 (`import * as Effect from "effect/Effect"`, never from the `effect` barrel). This was previously an unenforced written convention.                                  |
| `no-js-extension-imports`       | **High**, conditional on adopting `rewriteRelativeImportExtensions` (recommended in the stack research archived on the `planning-archive` branch, §5.3). Enforces `./x.ts` import specifiers over `./x.js`. |
| `no-opaque-instance-fields`     | **Medium.** Applies to `Schema.Opaque` classes; relevant if ADR-EC-008's Schema decoding uses them.                                                                                                         |
| `no-bigint-literals`            | **Low.** Effect supports older JS targets; effect-cucumber targets ES2022. Harmless to keep enabled.                                                                                                        |

## Runtime dependency

These rules need `@oxlint/plugins` (published on npm, currently `1.80.0`) as a
dev dependency — for types only, but oxlint's JS-plugin loader resolves it.
Keep its version matched to `oxlint`'s.

## Wiring

`@effect/oxc` is loaded upstream via `"jsPlugins": ["@effect/oxc/oxlint"]`.
Because this copy is a plain directory rather than a workspace package, load it
by path instead — the pattern `TeamWarp/effect-mq` uses for its own local
plugins:

```jsonc
// .oxlintrc.json
"jsPlugins": [
  { "name": "effect", "specifier": "./tools/oxlint/effect/index.ts" }
]
```

The `name` must stay `"effect"` so rule IDs match upstream's
(`effect/no-import-from-barrel-package`, …) and Effect's own `oxlintrc.json`
rule block can be copied without renaming.

## Updating

There is no dependency bot path for vendored code. To resync:

```bash
B=https://raw.githubusercontent.com/Effect-TS/effect/main/packages/tools/oxc/src/oxlint/rules
for r in no-bigint-literals no-import-from-barrel-package \
         no-js-extension-imports no-opaque-instance-fields; do
  curl -sfL "$B/$r.ts" -o "tools/oxlint/effect/rules/$r.ts"
done
```

Re-check upstream's `package.json` peer range before pulling in
`no-unused-internal`.
