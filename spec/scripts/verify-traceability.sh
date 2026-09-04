#!/usr/bin/env bash
#
# Verifies the structural integrity of spec/: every index.yaml entry resolves and
# every file is indexed, every invariant and decision is traced, every @REQ-EC-NNN
# tag is defined, carried exactly once under packages/vitest/test/acceptance/, and
# has a §5 row, and every relative link resolves to a tracked file. Adapted from
# qadi's spec/scripts/verify-traceability.sh. `--strict` turns a SKIP into a FAIL.
#
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

ACCEPTANCE_TAG_DIR="packages/vitest/test/acceptance"

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
# Check 4 above is necessary and it is not sufficient. It asks one question —
# ---------------------------------------------------------------------------
EXPECTED_REQ_COUNT=32

if [[ "$GIT_SCAN_AVAILABLE" -eq 0 ]]; then
  : # already reported above
elif [[ -f "$SPEC_DIR/traceability.md" ]]; then
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

    rows=$(awk '/^## §5 /{ inside = 1; next } /^## /{ inside = 0 } inside' "$SPEC_DIR/traceability.md" \
      | grep -oE '^\|[[:space:]]*REQ-EC-[0-9]{3}[[:space:]]*\|' \
      | grep -oE 'REQ-EC-[0-9]{3}' | LC_ALL=C sort -u)
    unrowed=$(comm -23 <(printf '%s\n' "$distinct") <(printf '%s\n' "$rows") | tr '\n' ' ' | sed 's/ *$//')

    covered=$(printf '%s\n' "$distinct" | wc -l | tr -d ' ')

    if [[ -n "$duplicated" ]]; then
      report FAIL "requirement ids carried exactly once" "duplicated: $duplicated"
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
