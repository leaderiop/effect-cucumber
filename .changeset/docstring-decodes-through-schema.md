---
"@effect-cucumber/gherkin": minor
"@effect-cucumber/vitest": minor
---

A step's `DocString` argument can now be decoded through `effect/Schema` on demand, mirroring
`decodeHashes` (DataTable) and `decodeExamplesRow` (ExamplesRow) one level shallower — a DocString
decodes a single string, so there is no row/column to locate, only the DocString's own `uri`/`line`
(both new fields on `DocString` itself, populated from the step's own location).

```ts
import { decodeDocString } from "@effect-cucumber/vitest"
import { Schema } from "effect"

const Payload = Schema.Struct({ sku: Schema.String, qty: Schema.Number })

Then("the request body is:", function*(docString) {
  const payload = yield* decodeDocString(Schema.fromJsonString(Payload))(docString)
  // ...
})
```

A decode failure raises a `DocStringError` (reason `DecodeFailed`) naming the DocString's `uri` and
`line`, quoting the full, untruncated content. See ADR-EC-046.
