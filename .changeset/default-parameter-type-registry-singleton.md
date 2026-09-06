---
"@effect-cucumber/gherkin": patch
---

`ParameterTypeStore.Default` now shares one process-wide, built-ins-only `ParameterTypeRegistry`
across every build that never declares a custom parameter type, instead of constructing a fresh
one per `loadFeature`/`parseFeature` call. This lets `StepMatcher`'s registry-keyed compiled-
expression cache actually share hits across Feature files that use no custom parameter types —
measured 2.86x faster (50.4ms → 17.6ms) on `StepMatcher`'s compile path across a 24-Feature suite
sharing one step vocabulary with no customization.

`ParameterTypeStore.layer(definitions)` and `createParameterTypeStore()` are unaffected: both
still build a fresh, isolated registry on every call, exactly as before. A store obtained from
`ParameterTypeStore.Default` that has `define()` called on it directly also still gets a fresh,
unshared registry. No public API changed. See [ADR-EC-045](../spec/decisions/045-parametertypestoredefault-shares-one-registry-across-zero-customization-builds.md).
