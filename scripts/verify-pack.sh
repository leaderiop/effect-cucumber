#!/usr/bin/env bash
#
# Asserts the shape of the artifact that actually reaches consumers -- the
# packed tarball -- rather than the shape of the source manifest.
#
# METHOD NOTE (do not weaken this):
#   packages/vitest/package.json reads `catalog:peer` whether the catalog behind
#   it holds a range or an exact pin. The source manifest is byte-identical
#   either way, so grepping it proves nothing at all. A `catalog:` specifier
#   expands verbatim at pack time (PITFALLS Pitfall 20), and the expanded value
#   is what a consumer resolves against -- an exact pin there strands everyone
#   on a different rc. The same goes for `publishConfig.exports`: the in-repo
#   `exports` map points at `src/`, and only npm's pack-time merge swaps it to
#   `dist/`. Every assertion below therefore runs against an UNPACKED TARBALL.
#   An assertion rewritten to read packages/*/package.json is vacuous.
#
#   A second reason to pack: `pnpm install` exits 0 on an invalid named-catalog
#   reference (`catalog:typo` behind a peerDependency leaves no trace in the
#   lockfile). `pnpm pack` is the only command that catches it.
#
# Usage: bash scripts/verify-pack.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo ""
  echo "✗ pack shape: BROKEN"
  echo ""
  echo "  $1"
  echo ""
  exit 1
}

# The manifest assertions, in node so the JSON is parsed rather than grepped.
# `jq` is deliberately not used -- it is not a declared dependency of this
# repository and may not be installed on a contributor machine or a CI runner.
# The JSON is passed as argv rather than read with `require`/`import` so the
# program is agnostic to whether node evaluates -e as ESM or CJS.
assert_manifest() {
  node -e '
    const name = process.argv[1]
    const m = JSON.parse(process.argv[2])
    const fails = []
    const ok = []
    const depFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]

    // The publishConfig.exports swap fired.
    const dot = m.exports && m.exports["."]
    if (typeof dot !== "string" || !dot.endsWith("dist/index.js")) {
      fails.push(
        "publishConfig.exports did not apply: exports[\".\"] is " + JSON.stringify(dot) +
        ", expected a path ending in dist/index.js. The published entry point still points at source, " +
        "so a consumer would resolve TypeScript instead of JavaScript."
      )
    } else {
      ok.push("exports[\".\"] -> " + dot + "  (publishConfig.exports applied)")
    }

    // The exports map is the only resolution surface.
    const legacy = ["main", "types", "typings"].filter((f) => f in m)
    if (legacy.length > 0) {
      fails.push(
        "packed manifest declares " + legacy.map((f) => JSON.stringify(f)).join(", ") +
        " -- the exports map must be the only resolution surface."
      )
    } else {
      ok.push("no main / types / typings field")
    }

    // ESM only: no require condition anywhere in the exports map.
    const requirePaths = []
    const walk = (node, path) => {
      if (node === null || typeof node !== "object") return
      for (const [k, v] of Object.entries(node)) {
        if (k === "require") requirePaths.push(path + "." + k)
        walk(v, path + "." + k)
      }
    }
    walk(m.exports === undefined ? {} : m.exports, "exports")
    if (requirePaths.length > 0) {
      fails.push("ESM-only violated: the exports map declares a require condition at " + requirePaths.join(", "))
    } else {
      ok.push("no require condition in the exports map")
    }

    // Nothing left for npm to choke on.
    const unexpanded = []
    for (const f of depFields) {
      const entries = m[f] === undefined ? {} : m[f]
      for (const [k, v] of Object.entries(entries)) {
        if (typeof v === "string" && (v.includes("catalog:") || v.includes("workspace:"))) {
          unexpanded.push(f + "." + k + " = " + v)
        }
      }
    }
    if (unexpanded.length > 0) {
      fails.push(
        "unexpanded protocol in published manifest: " + unexpanded.join(", ") +
        " -- npm cannot resolve catalog: or workspace: specifiers, so this tarball is unpublishable."
      )
    } else {
      ok.push("no catalog: or workspace: protocol left in any dependency field")
    }

    // Pitfall 20, the reason this script exists.
    if (name === "@effect-cucumber/vitest") {
      const peers = m.peerDependencies === undefined ? {} : m.peerDependencies
      for (const dep of ["effect", "@effect/vitest"]) {
        const v = peers[dep]
        if (v === undefined) {
          fails.push("peerDependencies." + dep + " is missing from the packed manifest.")
        } else if (/^[0-9]/.test(v)) {
          fails.push(
            "peerDependencies." + dep + " is an exact pin (" + v + ") -- Pitfall 20: the catalog expanded a pin " +
            "into the published peer range; consumers on a different rc cannot resolve this package. " +
            "Fix the `peer` catalog in pnpm-workspace.yaml, not this package.json."
          )
        } else {
          ok.push("peerDependencies." + dep + " = " + v + "  (a range, not a pin)")
        }
      }
    }

    // ADR-EC-021 (which supersedes ADR-EC-015 in its own title): gherkin IS
    // Effect-native now. What matters is no longer WHETHER effect appears, but
    // WHICH FIELD it appears in -- the same peer-vs-hard-dependency distinction
    // scripts/verify-no-runner-dep.sh already enforces over the SOURCE
    // manifest, asserted here over the artifact a consumer actually installs.
    //
    //   effect / @effect/platform  -- REQUIRED as a peer (effect) and correct
    //     as a devDependency, FORBIDDEN in dependencies / optionalDependencies
    //     / bundledDependencies. A second copy installed for the consumer is
    //     the duplicate-package hazard that breaks Context.Service identity,
    //     which is the concern ADR-EC-015 raised and ADR-EC-021 keeps, handled
    //     by the peer range rather than by abstinence. @effect/platform itself
    //     is deliberately NOT required: no v4-compatible release exists (see
    //     ADR-EC-021 Correction 2), so it is permitted-in-peer, never demanded.
    //
    //   vitest / @effect/vitest / @effect/platform-{node,bun,deno}  -- a test
    //     runner or a CONCRETE platform implementation. Legitimate in
    //     devDependencies (gherkin runs its own tests against them, and a
    //     devDependency is never installed by a consumer), forbidden in every
    //     other field. Whichever runner package consumes gherkin owns these.
    if (name === "@effect-cucumber/gherkin") {
      const field = (f) => (m[f] === undefined ? {} : m[f])
      const bundledRaw = m.bundledDependencies === undefined ? m.bundleDependencies : m.bundledDependencies
      const bundled = Array.isArray(bundledRaw) ? bundledRaw : []
      const has = (f, dep) => Object.prototype.hasOwnProperty.call(field(f), dep)

      // Positive assertion. Without it a manifest that simply DROPPED effect
      // would sail through the two negative assertions below by declaring
      // nothing at all -- and would ship a package whose imports resolve
      // against whatever copy of effect the consumer happens to have, or none.
      if (!has("peerDependencies", "effect")) {
        fails.push(
          "peerDependencies.effect is missing from the packed manifest -- ADR-EC-021 requires effect as a PEER " +
          "dependency of this package. Without it a consumer gets no version constraint at all on the copy of " +
          "effect that gherkin resolves against."
        )
      } else {
        ok.push("peerDependencies.effect = " + field("peerDependencies").effect + "  (required by ADR-EC-021)")
      }

      // The package runs its own test suite against effect, so it must also be
      // able to build and test standalone. devDependencies do not reach a
      // consumer, so this costs the shipped package nothing.
      if (!has("devDependencies", "effect")) {
        fails.push(
          "devDependencies.effect is missing from the packed manifest -- gherkin builds and tests against effect, " +
          "and a peerDependency alone does not install it for this repository."
        )
      } else {
        ok.push("devDependencies.effect = " + field("devDependencies").effect + "  (correct under ADR-EC-021)")
      }

      // Negative assertion 1: nothing peer-only may be installed by default or
      // bundled. optionalDependencies installs for a consumer exactly like
      // dependencies does, so it is checked, not assumed harmless.
      const hardened = []
      for (const dep of ["effect", "@effect/platform"]) {
        for (const f of ["dependencies", "optionalDependencies"]) {
          if (has(f, dep)) hardened.push(f + "." + dep + " = " + JSON.stringify(field(f)[dep]))
        }
        if (bundled.includes(dep)) hardened.push("bundledDependencies includes " + JSON.stringify(dep))
      }
      if (hardened.length > 0) {
        fails.push(
          "effect / @effect/platform must be a PEER dependency only, never installed by default or bundled, but " +
          "the packed manifest declares " + hardened.join(", ") + ". A consumer would get a second copy of effect, " +
          "breaking Context.Service identity across the two (ADR-EC-021, and the original concern of ADR-EC-015)."
        )
      } else {
        ok.push("effect / @effect/platform appear in no consumer-installed field  (ADR-EC-021)")
      }

      // Negative assertion 2: a runner or a concrete platform implementation
      // may live in devDependencies and nowhere else.
      const leaked = []
      for (const dep of ["vitest", "@effect/vitest", "@effect/platform-node", "@effect/platform-bun", "@effect/platform-deno"]) {
        for (const f of ["dependencies", "optionalDependencies", "peerDependencies"]) {
          if (has(f, dep)) leaked.push(f + "." + dep + " = " + JSON.stringify(field(f)[dep]))
        }
        if (bundled.includes(dep)) leaked.push("bundledDependencies includes " + JSON.stringify(dep))
      }
      if (leaked.length > 0) {
        fails.push(
          "the packed manifest declares " + leaked.join(", ") + " outside devDependencies -- gherkin must stay " +
          "runtime-agnostic and runner-agnostic (ADR-EC-021). A concrete platform implementation and a test " +
          "runner are the concern of whichever runner package consumes this one."
        )
      } else {
        ok.push("no test runner and no concrete @effect/platform-* outside devDependencies  (ADR-EC-021)")
      }
    }

    for (const line of ok) console.log("  ✓ " + line)
    if (fails.length > 0) {
      console.error("")
      for (const line of fails) console.error("  ✗ " + line)
      process.exit(1)
    }
  ' "$1" "$2"
}

check_package() {
  local name="$1"
  local slug="$2"
  local dest="$TMP/$slug"

  echo ""
  echo "$name"

  mkdir -p "$dest"

  if ! pnpm --filter "$name" pack --pack-destination "$dest" >/dev/null; then
    fail "pnpm pack failed for $name. A broken catalog: reference surfaces here and nowhere else -- pnpm install exits 0 on an invalid named-catalog entry behind a peerDependency."
  fi

  local tgz
  tgz="$(find "$dest" -maxdepth 1 -name "*.tgz" -print -quit)"
  [[ -n "$tgz" ]] || fail "pnpm pack produced no tarball for $name in $dest."

  tar -xzf "$tgz" -C "$dest"

  local pkgdir="$dest/package"
  local manifest="$pkgdir/package.json"
  [[ -f "$manifest" ]] || fail "the $name tarball contains no package/package.json."

  local contents
  contents="$(tar -tzf "$tgz")"

  # Manifest shape.
  if ! assert_manifest "$name" "$(cat "$manifest")"; then
    fail "$name: the packed manifest is wrong (reasons above)."
  fi

  # Tarball contents. `exports` naming dist/index.js means nothing if the file
  # is not in the tarball -- that ships a package that fails on first import.
  local entry
  for entry in "package/dist/index.js" "package/dist/index.d.ts"; do
    grep -qx "$entry" <<<"$contents" || fail "$name: $entry is absent from the tarball, but the exports map points at it."
  done
  echo "  ✓ dist/index.js and dist/index.d.ts are both in the tarball"

  local cjs
  cjs="$(grep -E "\.cjs$" <<<"$contents" || true)"
  [[ -z "$cjs" ]] || fail "ESM-only violated: $name ships CJS output ($(tr '\n' ' ' <<<"$cjs"))."
  echo "  ✓ no .cjs output in the tarball"

  # npm ships README.md regardless of the files field; this asserts it actually
  # happened rather than trusting that behaviour.
  grep -qx "package/README.md" <<<"$contents" || fail "$name: README.md is absent from the tarball -- the npm page would be blank."
  echo "  ✓ README.md is in the tarball"
  # package.json declares "license": "MIT"; a tarball that carries the claim without the
  # text is what this catches. npm auto-includes a LICENSE only from the package directory.
  grep -qx "package/LICENSE" <<<"$contents" || fail "$name: LICENSE is absent from the tarball -- package.json claims MIT but ships no license text."
  echo "  ✓ LICENSE is in the tarball"

  # publint reads the extracted directory, catching publish-time footguns this
  # script does not encode by hand.
  if ! pnpm exec publint "$pkgdir"; then
    fail "$name: publint reported errors against the packed package (output above)."
  fi
  echo "  ✓ publint reports no errors"
}

echo "Building before packing -- the tarball is only as correct as dist/."
pnpm build

check_package "@effect-cucumber/gherkin" "gherkin"
check_package "@effect-cucumber/vitest" "vitest"

echo ""
echo "pack shape: OK"
