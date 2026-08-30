# The rc-bump checklist

The procedure for moving this repository's pinned `effect` and `@effect/vitest` release candidates
forward. It exists because PITFALLS Pitfall 18 measured that the obvious heuristic is exactly
backwards: Effect's changesets run in pre-mode, where major, minor and patch all collapse into one
`rc.N` increment, so **every** entry in the changelog lands under `### Patch Changes` regardless of
severity. Breaking removals are routinely filed as "patch" — 68 exports were removed across one
eight-rc window, all of them "patch". A changelog heading tells you nothing about what broke.

This document is checklist item **P-18** of
[`looks-done-but-isnt-checklist.md`](./looks-done-but-isnt-checklist.md), and step 6 below is the full
form of that document's item **P-15**, which is a RELEASE-time step and deliberately not a per-push
gate. `scripts/verify-pitfalls-checklist.sh` asserts that this file exists and names the acceptance
suite as the gate; it cannot assert that anyone followed the steps.

## The procedure

### 1. The acceptance suite is the gate, not `tsc`

**`pnpm test`, and specifically the acceptance suite under `packages/vitest/test/acceptance/`, is the
gate for an rc bump.** A green `pnpm build` is not sufficient and never was: `tsc -b` catches
signature changes only where a signature is annotated by hand, and the RC train breaks mostly at the
signature level while staying additive at the name level. Pitfall 18's own warning sign is the rule
here — _"a green `tsc -b` after an rc bump is not sufficient"_.

Bump `effect` deliberately, in its own commit, never as an incidental lockfile refresh. Read
`packages/effect/CHANGELOG.md` on Effect's `main` branch and the open `.changeset/` directory (which
previews the _next_ rc) before bumping; note that the changelog is not shipped in the npm tarball, so
`node_modules` cannot tell you what changed.

### 2. Only `pnpm-workspace.yaml` is edited

Every version lives in that one file (ADR-EC-012), and **no `packages/*/package.json` is touched by a
bump.** They all read `catalog:` or `catalog:peer` and are byte-identical before and after.

### 3. The two catalogs are separate, and they are not the same edit

`pnpm-workspace.yaml` carries two blocks and they mean different things:

- `catalog:` — **exact pins, devDependencies only.** This is what the repository's own build and test
  run against.
- `catalogs.peer:` — **ranges, peerDependencies only.** This is what a consumer resolves against. A
  `catalog:` specifier expands **verbatim** at pack time (Pitfall 20), so an exact pin written here
  would publish an exact peer range and strand every consumer sitting on a different rc.

Bumping the pin without widening the range, or copying the pin into the range, are two different
mistakes and both are one keystroke away.

### 4. Re-run `pnpm verify:pack`

Because of the expansion in step 3, **the only place a catalog mistake becomes visible is the packed
tarball.** `pnpm install` exits 0 on an invalid named-catalog reference — `catalog:typo` behind a
peerDependency leaves no trace in the lockfile — and the source manifest reads identically whether the
catalog behind it holds a range or a pin. Run `pnpm verify:pack` after every bump, not as part of the
release, but as part of the bump.

### 5. Re-check the peer ranges by hand

`catalogs.peer.vitest` is copied verbatim from `@effect/vitest`'s own published `peerDependencies`,
and **nothing in this repository enforces that the two stay in sync.** There is no gate for it; a
newer `@effect/vitest` that widened or narrowed its own vitest range leaves this repository's copy
silently stale. Read the newly-installed `node_modules/@effect/vitest/package.json` and compare its
`peerDependencies` against the `peer` catalog by eye. If they diverge, decide deliberately — do not
widen this repository's range past what `@effect/vitest` itself supports.

### 6. The live scratch-consumer install, under BOTH pnpm and npm

This is checklist item **P-15** in full, and this is where it is performed. What runs on every push is
only the structural precondition read out of the packed tarballs; the live install needs the network
and a real registry, and making every CI run depend on a third party's availability is not a trade
this repository takes. It is a release-time step, done here, by hand.

Pack the two packages, then install them into a throwaway consumer that is already sitting on a
**different** rc from the one just pinned:

```sh
pnpm --filter @effect-cucumber/gherkin pack --pack-destination /tmp/rc-bump
pnpm --filter @effect-cucumber/vitest  pack --pack-destination /tmp/rc-bump

mkdir -p /tmp/rc-bump/consumer-pnpm && cd /tmp/rc-bump/consumer-pnpm
pnpm init
pnpm add -D /tmp/rc-bump/effect-cucumber-vitest-*.tgz effect@rc @effect/vitest@rc vitest
pnpm list --depth Infinity effect vitest
```

and the same again under npm, because the two resolvers disagree about peer ranges often enough to be
worth the second run:

```sh
mkdir -p /tmp/rc-bump/consumer-npm && cd /tmp/rc-bump/consumer-npm
npm init -y
npm install --save-dev /tmp/rc-bump/effect-cucumber-vitest-*.tgz effect@rc @effect/vitest@rc vitest
npm ls effect vitest --all
```

**The expected result, in both consumers, is exactly one resolved `effect` and exactly one resolved
`vitest`.** Two copies of `effect` is the failure this step exists to catch: `Context.Service`
identity is per-copy, so a second `effect` in the tree makes a service provided by one copy invisible
to a step resolving it through the other — and the symptom is a service-not-found at run time in a
consumer's suite, not anything visible in this repository.

### 7. Update the READMEs if the floor moved

The root [`README.md`](../../README.md) and [`packages/vitest/README.md`](../../packages/vitest/README.md)
each state a minimum Effect version in prose ("Requires Effect v4 (`4.0.0-rc.NNN` or newer)"). If the
bump moved that floor, both say so in the same commit. Their `@rc` install lines are asserted by
checklist item **P-17**; the prose version floor beside them is not, and is the thing most likely to
go stale.

## What this document deliberately does not do

It does not automate. Steps 1, 4 and 6 are commands, but the judgement in steps 3 and 5 is the part
that matters, and it is the part a script would have to guess at. Pitfall 18's finding is precisely
that the machine-readable signal — the changelog heading — is the misleading one.
