# Changesets

Every user-visible change to `@effect-cucumber/gherkin` or `@effect-cucumber/vitest` lands with a
changeset file in this directory (`pnpm changeset` writes one). The release workflow
(`.github/workflows/release.yml`) turns pending changesets into a "Version Packages" pull request,
and merging that PR publishes. `spec/process/release-checklist.md` is the procedure.
