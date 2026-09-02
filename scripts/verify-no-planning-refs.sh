#!/usr/bin/env bash
#
# Asserts that no source, test, config or gate-script line cites a planning artefact
# that lives only on the `planning-archive` branch, or an id that resolves only there.
# `pnpm lint` and `pnpm test` cannot catch it: a citation is prose, and prose that a
# reader cannot open rots without anything going red. The forbidden tokens are spelled
# in exactly ONE place below (FORBIDDEN_RE) and this file excludes itself from the scan,
# so the gate cannot false-positive on its own definition. Positive control: a temp
# file outside the repository carrying one token must be caught before anything is
# scanned. `STRICT_PACKAGES=0` downgrades hits under packages/ to a warning; the default is strict.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="scripts/verify-no-planning-refs.sh"
STRICT_PACKAGES="${STRICT_PACKAGES:-1}"

FORBIDDEN_RE='\.planning|RESEARCH\.md|CONTEXT\.md|PITFALLS|REQUIREMENTS\.md|STATE\.md|SUMMARY\.md|\b(D|T|PROH|WR|SC)-[0-9]{2}(-[0-9]{2}){0,2}\b|\b[Pp]lan [0-9]{2}-[0-9]{2}\b|\b[0-9]{2}-(CONTEXT|RESEARCH|PLAN|SUMMARY)\b|\b[Pp]hase [0-9]{1,2}\b|\([0-9]{2}-[0-9]{2}\)|\b(RUN|DSL|MATCH|PARSE|LINT)-[0-9]{2}\b'

fail() {
  echo ""
  echo "✗ $1" >&2
  echo ""
  exit 1
}

scan() {
  # $1: a path list (space separated) relative to ROOT_DIR. Prints file:line:text hits.
  # shellcheck disable=SC2086
  (cd "$ROOT_DIR" && grep -rnE --include='*.ts' --include='*.sh' --include='*.feature' --include='*.yml' --include='*.yaml' --include='*.json' "$FORBIDDEN_RE" $1 2>/dev/null | grep -v "^$SELF:" || true)
}

# Positive control: the scan must catch a planted token, or every clean result below is vacuous.
CONTROL_DIR="$(mktemp -d)"
trap 'rm -rf "$CONTROL_DIR"' EXIT INT TERM
printf '// see the pitfalls research\n// PITFALLS Pitfall 3\n' > "$CONTROL_DIR/planted.ts"
if ! grep -rnE "$FORBIDDEN_RE" "$CONTROL_DIR" >/dev/null 2>&1; then
  fail "positive control failed: a planted token was not caught, so the regex or the grep invocation is broken and every clean scan below would be vacuous."
fi
echo "✓ positive control: a planted citation outside the repository is caught"

STRICT_HITS="$(scan "scripts vitest.config.ts vitest.tags.ts packages/vitest/vitest.config.ts packages/gherkin/vitest.config.ts .github pnpm-workspace.yaml tsconfig.json tsconfig.base.json packages/vitest/tsconfig.json packages/vitest/tsconfig.test.json packages/gherkin/tsconfig.json packages/gherkin/tsconfig.test.json")"
if [[ -n "$STRICT_HITS" ]]; then
  echo "$STRICT_HITS"
  fail "$(echo "$STRICT_HITS" | wc -l | tr -d ' ') line(s) under scripts/, .github/ or a workspace/tsconfig/vitest config cite a planning artefact (listed above). Replace the citation with the spec document or the test that now carries the fact, or delete the sentence."
fi
echo "✓ scripts/, .github/ and the workspace, tsconfig and vitest configs cite no planning artefact"

PACKAGE_HITS="$(scan "packages/gherkin/src packages/gherkin/test packages/vitest/src packages/vitest/test")"
PACKAGE_COUNT="$(if [[ -n "$PACKAGE_HITS" ]]; then echo "$PACKAGE_HITS" | wc -l | tr -d ' '; else echo 0; fi)"
if [[ "$PACKAGE_COUNT" -ne 0 ]]; then
  if [[ "$STRICT_PACKAGES" == "1" ]]; then
    echo "$PACKAGE_HITS"
    fail "$PACKAGE_COUNT line(s) under packages/ cite a planning artefact (listed above). Replace the citation with the spec document or the test that now carries the fact, or delete the sentence."
  fi
  echo "⚠ $PACKAGE_COUNT line(s) under packages/ still cite a planning artefact — STRICT_PACKAGES is off; these become failures once every comment-prune slice has landed"
else
  echo "✓ packages/ source and tests cite no planning artefact"
fi

echo ""
echo "no planning references: ENFORCED"
