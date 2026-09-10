# Gherkin syntax highlighting (effect-cucumber)

A minimal, self-contained VS Code extension: `.feature` syntax highlighting only — `Feature` /
`Rule` / `Background` / `Scenario` / `Scenario Outline` / `Examples` keywords, `Given`/`When`/
`Then`/`And`/`But` steps, `@tags`, `#` comments, `"""`/`'''` doc strings, and `|`-delimited data
tables. No step navigation, no "go to step definition" — that needs a language server indexing step
definitions across a workspace, out of scope here (see ADR-EC-060's sibling decision on the reporting
gap for the same "don't build more than the gap needs" reasoning).

Not published to any registry; not part of the `pnpm` workspace (`pnpm-workspace.yaml` does not glob
this directory) and not built, tested, or versioned alongside `@effect-cucumber/gherkin`/`@effect-cucumber/vitest`.

## Try it locally

```sh
ln -s "$(pwd)/editors/vscode" ~/.vscode/extensions/effect-cucumber-gherkin
```

(or the equivalent path for VS Code Insiders / a fork), then reload the window. Open any `.feature`
file and confirm highlighting — or use VS Code's own "Developer: Inspect Editor Tokens and Scopes"
command against a real file under `packages/vitest/test/acceptance/*.feature` to see the exact scope
each token resolved to.

## Package it

```sh
npx @vscode/vsce package --no-dependencies -o effect-cucumber-gherkin.vsix
```

then install the produced `.vsix` via VS Code's "Extensions: Install from VSIX…" command.
