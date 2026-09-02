#!/usr/bin/env bash
#
# Verifies the structural integrity of spec/.
#
# Adapted from qadi's spec/scripts/verify-traceability.sh (same method, same
# reasoning: nothing checks that the files on disk match the declared
# registry unless something does). Every check here exists to make one class
# of drift impossible to merge.
#
# Usage: bash spec/scripts/verify-traceability.sh [--strict]
#   --strict  treat SKIP as FAIL. The merge gate passes it: `pnpm verify:spec`
#             in package.json is this script WITH the flag, and CI runs that
#             script. Omit it only for an exploratory local run.
#
#             This comment was false for several phases — the flag was described
#             as always passed while `pnpm verify:spec` passed nothing — and
#             spec/process/definitions-of-done.md row 6 recorded the
#             contradiction instead of resolving it, on the grounds that it was
#             moot at 0 SKIP. Moot-ness was the load-bearing part: the day a
#             check SKIPs, a gate that ignores SKIP passes while two documents
#             say it should not. Resolved in the direction both documents
#             already claimed.

set -uo pipefail

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$SPEC_DIR/.." && pwd)"

PASS=0
FAIL=0
SKIP=0

report() { # status, check, detail
  printf '| %-6s | %-42s | %s\n' "$1" "$2" "$3"
  case "$1" in
    PASS) PASS=$((PASS + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    SKIP) if [[ $STRICT -eq 1 ]]; then FAIL=$((FAIL + 1)); else SKIP=$((SKIP + 1)); fi ;;
  esac
}

echo
echo "effect-cucumber specification verification"
echo "| Status | Check                                      | Detail"
echo "| ------ | ------------------------------------------ | ------"

# ---------------------------------------------------------------------------
# 1. Every index.yaml entry resolves to a file on disk, and vice versa.
# ---------------------------------------------------------------------------
for index in "$SPEC_DIR"/*/index.yaml; do
  [[ -e "$index" ]] || continue
  dir="$(dirname "$index")"
  name="$(basename "$dir")"

  missing=""
  declared=""
  while IFS= read -r file; do
    declared="${declared} ${file}"
    [[ -f "$dir/$file" ]] || missing="${missing} ${file}"
  done < <(grep -oE '^\s+file:\s*"[^"]+"' "$index" | sed -E 's/.*"([^"]+)".*/\1/')

  if [[ -n "$missing" ]]; then
    report FAIL "$name/index.yaml -> disk" "missing:${missing}"
  else
    count=$(wc -w <<< "$declared" | tr -d ' ')
    # `entr(y|ies)` was printed verbatim here — a regex alternation that never
    # ran, in the line a reader scans while looking for a FAIL.
    if [[ "$count" -eq 1 ]]; then
      report PASS "$name/index.yaml -> disk" "1 entry resolves"
    else
      report PASS "$name/index.yaml -> disk" "$count entries resolve"
    fi
  fi

  # Reverse: any .md on disk not declared in the registry is an orphan.
  orphans=""
  for f in "$dir"/*.md; do
    [[ -e "$f" ]] || continue
    base="$(basename "$f")"
    [[ "$base" == "README.md" ]] && continue
    grep -q "\"$base\"" "$index" || orphans="${orphans} ${base}"
  done

  if [[ -n "$orphans" ]]; then
    report FAIL "$name/ disk -> index.yaml" "orphaned:${orphans}"
  else
    report PASS "$name/ disk -> index.yaml" "no orphans"
  fi
done

# ---------------------------------------------------------------------------
# 2. Every INV-EC-NNN in invariants.md appears in traceability.md.
# ---------------------------------------------------------------------------
if [[ -f "$SPEC_DIR/invariants.md" && -f "$SPEC_DIR/traceability.md" ]]; then
  untraced=""
  while IFS= read -r inv; do
    grep -q "$inv" "$SPEC_DIR/traceability.md" || untraced="${untraced} ${inv}"
  done < <(grep -oE 'INV-EC-[0-9]{3}' "$SPEC_DIR/invariants.md" | sort -u)

  if [[ -n "$untraced" ]]; then
    report FAIL "invariants -> traceability" "untraced:${untraced}"
  else
    report PASS "invariants -> traceability" "all invariants traced"
  fi
else
  report SKIP "invariants -> traceability" "invariants.md or traceability.md absent"
fi

# ---------------------------------------------------------------------------
# 3. Every ADR file maps to an ADR-EC-NNN present in traceability.md.
# ---------------------------------------------------------------------------
if [[ -d "$SPEC_DIR/decisions" && -f "$SPEC_DIR/traceability.md" ]]; then
  untraced=""
  found=0
  for f in "$SPEC_DIR"/decisions/[0-9][0-9][0-9]-*.md; do
    [[ -e "$f" ]] || continue
    found=$((found + 1))
    num="$(basename "$f" | cut -c1-3)"
    grep -q "ADR-EC-$num" "$SPEC_DIR/traceability.md" || untraced="${untraced} ADR-EC-$num"
  done

  if [[ $found -eq 0 ]]; then
    report SKIP "decisions -> traceability" "no ADR files yet"
  elif [[ -n "$untraced" ]]; then
    report FAIL "decisions -> traceability" "untraced:${untraced}"
  else
    report PASS "decisions -> traceability" "$found ADR(s) traced"
  fi
else
  report SKIP "decisions -> traceability" "decisions/ or traceability.md absent"
fi

# ---------------------------------------------------------------------------
# 4. Every REQ-EC-NNN tag used in a .feature file is defined in traceability.md,
#    AND no .feature file outside the acceptance directory carries one.
#
# TWO DIRECTIONS, AND THE SECOND ONE HAD TO BE WRITTEN. AGENTS.md §5 and
# packages/vitest/test/acceptance/README.md both said this check enforced the
# directory rule "in both directions"; it enforced NEITHER direction of it. It
# did exactly one thing — for every tag found in any .feature file anywhere,
# grep that id out of traceability.md — with no directory scoping at all.
#
# The claim looked true because check 5 catches a stray tag TODAY, and only
# incidentally: the id space is saturated at EXPECTED_REQ_COUNT/EXPECTED_REQ_COUNT,
# so a tag written anywhere lands as `duplicated` or `outofrange`. The moment
# that constant is bumped for a newly allocated requirement, a @REQ-EC-023 in
# packages/gherkin/test/fixtures/ passes every check while two documents still
# say it cannot. That is the failure mode AGENTS.md §4 exists to prevent,
# asserted in a file that states §4.
#
# ACCEPTANCE_TAG_DIR is the one directory where the tag is legal. The parser
# corpus under packages/gherkin/test/fixtures/ and the tag-scanning fixtures
# under packages/vitest/test/fixtures/ are never handed to a runner, so a tag
# there would join the traceability chain while executing nothing — which is
# precisely the "covered" claim this whole file exists to keep honest.
#
# No .feature suite exists yet (see spec/roadmap.md) — this SKIPs cleanly
# until packages/*/test/features (or wherever the acceptance suite ends up)
# exists and starts tagging scenarios.
# ---------------------------------------------------------------------------
ACCEPTANCE_TAG_DIR="packages/vitest/test/acceptance"

# THE SCAN IS DRIVEN FROM GIT, NOT FROM THE FILESYSTEM, and checks 4 and 5 both
# use it. `grep -r "$ROOT_DIR" --include='*.feature'` limited by NAME but not by
# DIRECTORY, so the walk descended into node_modules/, .git/, .planning/ and any
# transient directory a concurrently-running gate had created. Two consequences,
# and the second is the one that bites: the "carried exactly once" claim was a
# claim about THE FILESYSTEM rather than about the source tree, and a dependency
# upgrade that pulls in a `.feature` corpus (the @cucumber/* packages routinely
# ship testdata) could turn `pnpm verify:spec` red — or silently satisfy the
# duplicate check.
#
# `--untracked` is deliberate and is NOT the same as plain `git grep`. Plain
# `git grep` sees only what is in the index, so a newly written, not-yet-added
# acceptance pair would be invisible and the gate would pass by not looking.
# `--untracked` searches tracked AND untracked files while still honouring
# .gitignore, which is exactly the set the claim is about: it skips node_modules/
# and .git/ because they are ignored, and it skips the transient `.feature` files
# scripts/verify-pitfalls-checklist.sh and scripts/verify-watch-rerun.sh write
# because those are ignored too — removing the concurrency hazard
# verify-watch-rerun.sh otherwise mitigates by hand.
#
# .planning/ is excluded by pathspec as well as being gitignored (it lives on the
# planning-archive branch, F-27). It is GSD-internal, and coupling a spec/ gate to its contents is threat
# T-11-06-05, which check 5's EXPECTED_REQ_COUNT comment records as knowingly
# accepted rather than mitigated. Excluding it here keeps that acceptance intact.
# MEASURED, three arms, each run against this repository and reverted:
#
#   M1, a tagged `.feature` written into packages/gherkin/test/fixtures/ and NOT
#       `git add`ed -> BOTH checks RED, naming the file. This is the arm
#       `--untracked` exists for; plain `git grep` would have passed by not
#       looking.
#   M2, the same content written to the transient
#       packages/vitest/test/acceptance/pitfalls-gate-probe.feature that
#       scripts/verify-pitfalls-checklist.sh creates -> INVISIBLE, both checks
#       PASS. It is gitignored (WR-04), so a concurrently-running gate can no
#       longer turn this one red.
#   M3, a vendored corpus at node_modules/@cucumber/fake-testdata/vendored.feature
#       -> INVISIBLE, both checks PASS. Under the old filesystem walk this went
#       RED, which is the dependency-upgrade failure mode in full.
feature_tags() { # -h for occurrences, -l for file names
  git -C "$ROOT_DIR" grep "$1" --untracked -E '@REQ-EC-[0-9]{3}' \
    -- '*.feature' ':(exclude).planning/' 2>/dev/null
}

# A non-git checkout cannot answer the question at all, and must say so rather
# than report an empty scan as a clean one. Under --strict this SKIP is a FAIL,
# which is correct: the check did not run.
if ! git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  report SKIP "features -> traceability" "not a git checkout — the .feature scan is driven from git"
  report SKIP "requirement ids carried exactly once" "not a git checkout — the .feature scan is driven from git"
  GIT_SCAN_AVAILABLE=0
else
  GIT_SCAN_AVAILABLE=1
fi

if [[ "$GIT_SCAN_AVAILABLE" -eq 0 ]]; then
  : # already reported above
elif [[ -f "$SPEC_DIR/traceability.md" ]]; then
  tags=$(feature_tags -ho | sort -u)
  if [[ -z "$tags" ]]; then
    report SKIP "features -> traceability" "no .feature tags yet"
  else
    undefined=""
    while IFS= read -r tag; do
      grep -q "${tag#@}" "$SPEC_DIR/traceability.md" || undefined="${undefined} ${tag}"
    done <<< "$tags"

    # Direction two: the FILES carrying a tag, with the one legal directory
    # removed. `git grep -l` already yields repo-relative paths, so the message
    # is diffable rather than machine-specific with no rewriting.
    stray=$(feature_tags -l \
      | grep -v "^${ACCEPTANCE_TAG_DIR}/" \
      | sort \
      | tr '\n' ' ' | sed 's/ *$//')

    if [[ -n "$undefined" ]]; then
      report FAIL "features -> traceability" "undefined:${undefined}"
    elif [[ -n "$stray" ]]; then
      report FAIL "features -> traceability" \
        "REQ tag outside ${ACCEPTANCE_TAG_DIR}/ (AGENTS.md §5): $stray"
    else
      report PASS "features -> traceability" \
        "all REQ tags defined, and none outside ${ACCEPTANCE_TAG_DIR}/"
    fi
  fi
else
  report SKIP "features -> traceability" "traceability.md absent"
fi

# ---------------------------------------------------------------------------
# 5. Every v1 requirement id is carried EXACTLY ONCE, the set is contiguous and
#    complete, and each id has a real ROW in traceability.md §5.
#
# Check 4 above is necessary and it is not sufficient. It asks one question —
# is every tag that is USED also DEFINED — and that question is silent about
# all three of the failures this check exists to catch:
#
#   * COMPLETENESS. Check 4 iterates the tags that exist. Delete a tag and
#     there is simply one fewer thing to check, so it stays green. "22/22" is
#     precisely the claim it cannot make.
#   * DUPLICATION. A tag used twice is still defined, so check 4 stays green.
#     D-01 requires each requirement on exactly one Scenario; two Scenarios
#     claiming one requirement lets it look covered twice while another is
#     uncovered, and the total still looks right if nobody counts.
#   * A REAL ROW. Check 4's second half is `grep -q "REQ-EC-NNN"` over the
#     WHOLE of traceability.md, so an id merely MENTIONED in §5's prose
#     satisfies it. That is not a hypothetical: it is recorded four times in
#     this repository's planning history (11-03, 11-04, 11-05, 11-06), and in
#     11-06 the mention that kept it green was a sentence listing the ids as
#     NOT YET CARRIED. This check therefore matches the §5 TABLE — an id in the
#     first cell of a row — and never a substring of the file.
#
# Mutations B and C (recorded in
# packages/vitest/test/acceptance/negative-requirements.test.ts's module doc
# comment) are the measurement: a duplicated id and a deleted id each turn this
# check RED while check 4 stays PASS and `pnpm test` stays green.
#
# The expected count is written ONCE, below, as a named constant. A future
# phase adding a 23rd requirement changes that one number and gets a loud,
# named failure here in the meantime rather than a silent pass. It is
# deliberately NOT derived from the archived REQUIREMENTS.md: that would couple a
# spec/ gate to GSD-internal files, which is threat T-11-06-05, accepted
# knowingly rather than mitigated.
# ---------------------------------------------------------------------------
EXPECTED_REQ_COUNT=22

if [[ "$GIT_SCAN_AVAILABLE" -eq 0 ]]; then
  : # already reported above
elif [[ -f "$SPEC_DIR/traceability.md" ]]; then
  # Same git-driven scan as check 4 — see feature_tags above for why it is not a
  # filesystem walk. WITH duplicates, so `uniq -d` below can see them.
  # `LC_ALL=C` ON EVERY SORT THAT FEEDS `comm`, and it is a correctness fix
  # rather than a tidy-up. `expected` below is built by a printf loop, so it is
  # in C order by construction; `distinct` and `rows` come from `sort`, which
  # collates by LOCALE. `comm` requires both inputs to be sorted THE SAME WAY and
  # merely WARNS on input it thinks is unsorted — it does not fail — so a
  # mismatch yields a wrong `missing`/`outofrange`/`unrowed` set rather than an
  # error. Today every id is same-shape ASCII and the two orders coincide, which
  # is exactly the kind of accident that stops being true when a differently
  # shaped id family is introduced. Pinning the collation costs nothing and
  # removes the dependency on that coincidence.
  occurrences=$(feature_tags -ho | sed 's/^@//' | LC_ALL=C sort)

  if [[ -z "$occurrences" ]]; then
    report SKIP "requirement ids carried exactly once" "no .feature tags yet"
  else
    # WITH duplicates, so `uniq -d` can see them. `distinct` is the set.
    duplicated=$(printf '%s\n' "$occurrences" | uniq -d | tr '\n' ' ' | sed 's/ *$//')
    distinct=$(printf '%s\n' "$occurrences" | uniq)

    # The contiguous range the ids must form, built from the constant with a
    # bash loop rather than `seq -f` so the format is identical on every
    # platform this runs on.
    expected=""
    for ((n = 1; n <= EXPECTED_REQ_COUNT; n++)); do
      expected+="$(printf 'REQ-EC-%03d' "$n")"$'\n'
    done
    expected="${expected%$'\n'}"

    missing=$(comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$distinct") | tr '\n' ' ' | sed 's/ *$//')
    outofrange=$(comm -13 <(printf '%s\n' "$expected") <(printf '%s\n' "$distinct") | tr '\n' ' ' | sed 's/ *$//')

    # §5's TABLE, and only §5's: from its heading to the next one. An id counts
    # only when it is the FIRST CELL of a row — that is what makes this a row
    # and not a mention, which is the whole reason this check is separate from
    # check 4.
    rows=$(awk '/^## §5 /{ inside = 1; next } /^## /{ inside = 0 } inside' "$SPEC_DIR/traceability.md" \
      | grep -oE '^\|[[:space:]]*REQ-EC-[0-9]{3}[[:space:]]*\|' \
      | grep -oE 'REQ-EC-[0-9]{3}' | LC_ALL=C sort -u)
    unrowed=$(comm -23 <(printf '%s\n' "$distinct") <(printf '%s\n' "$rows") | tr '\n' ' ' | sed 's/ *$//')

    covered=$(printf '%s\n' "$distinct" | wc -l | tr -d ' ')

    if [[ -n "$duplicated" ]]; then
      report FAIL "requirement ids carried exactly once" "duplicated (D-01 allows one Scenario per id): $duplicated"
    elif [[ -n "$outofrange" ]]; then
      report FAIL "requirement ids carried exactly once" "outside REQ-EC-001..$(printf '%03d' "$EXPECTED_REQ_COUNT"): $outofrange"
    elif [[ -n "$missing" ]]; then
      report FAIL "requirement ids carried exactly once" "missing, so coverage is $covered/$EXPECTED_REQ_COUNT: $missing"
    elif [[ -n "$unrowed" ]]; then
      report FAIL "requirement ids carried exactly once" "tagged but with no §5 TABLE ROW (a prose mention is not a row): $unrowed"
    else
      report PASS "requirement ids carried exactly once" \
        "$covered/$EXPECTED_REQ_COUNT requirements covered by a passing test, each tagged once, each with a §5 row"
    fi
  fi
else
  report SKIP "requirement ids carried exactly once" "traceability.md absent"
fi

# ---------------------------------------------------------------------------
# 6. No broken relative markdown links.
#
# Links inside fenced code blocks are illustrative syntax examples, not real
# references, and are skipped — otherwise every doc that documents the link
# format reports itself as broken.
#
# A target that exists but is **gitignored** counts as broken — it resolves
# on the author's machine and fails on every clone. `-e` alone asks "can *I*
# read this", which is the wrong question for a document other people read.
# ---------------------------------------------------------------------------
broken=""
untracked=""
checked=0
while IFS= read -r md; do
  dir="$(dirname "$md")"
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    case "$target" in
      http*|mailto*|\#*) continue ;;
    esac
    path="${target%%#*}"
    [[ -z "$path" ]] && continue
    checked=$((checked + 1))
    if [[ ! -e "$dir/$path" ]]; then
      broken="${broken} $(basename "$md")->${path}"
    elif git -C "$ROOT_DIR" check-ignore -q "$dir/$path" 2>/dev/null; then
      untracked="${untracked} $(basename "$md")->${path}"
    fi
  done < <(awk '/^[[:space:]]*```/ { fence = !fence; next } !fence' "$md" \
    | grep -oE '\]\([^)]+\)' | sed -E 's/^\]\((.*)\)$/\1/')
done < <(find "$SPEC_DIR" -name '*.md' -type f)

if [[ -n "$broken" ]]; then
  report FAIL "relative link integrity" "broken:${broken}"
elif [[ -n "$untracked" ]]; then
  report FAIL "relative link integrity" "gitignored, so broken for everyone else:${untracked}"
else
  report PASS "relative link integrity" "$checked link(s) resolve, none gitignored"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP$([[ $STRICT -eq 1 ]] && echo ' (strict: skips count as failures)')"
echo

[[ $FAIL -eq 0 ]] || exit 1
