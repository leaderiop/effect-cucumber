# Research: `@cucumber/cucumber-expressions@20.1.0` compile/matching API

**Ticket:** [#3](https://github.com/leaderiop/effect-cucumber/issues/3) (child of #1)
**Method:** `npm install @cucumber/cucumber-expressions@20.1.0` in a throwaway
scratch directory (`/tmp/cucumber-expr-research`, outside this repo), then
read the shipped `.d.ts`/`.js` files in `node_modules/@cucumber/cucumber-expressions/dist/`
and run a real Node script (`test.mjs`) exercising the runtime API. All
findings below are primary-source (package files + actual `console.log`
output), not documentation summaries.

---

## 1. Compile/match API

**Spec assumption:** `spec/decisions/007-cucumber-expressions-for-step-matching.md`
doesn't name concrete classes/functions — it only asserts pattern syntax
compatibility (`{int}`, `{string}`, `{word}`, custom types). No conflict is
possible here, but the shape matters for how `@effect-cucumber/gherkin`
wraps it.

**What was found:**

- `ParameterTypeRegistry` (class, `dist/ParameterTypeRegistry.d.ts`) — the
  registry of parameter types. Its constructor takes no arguments and
  auto-populates itself with the built-in types by internally calling
  `defineDefaultParameterTypes(this)` (`dist/ParameterTypeRegistry.js:9-11`).
  A new `ParameterTypeRegistry()` is never "empty" — it always has `{int}`,
  `{float}`, `{string}`, `{word}`, `{double}`, `{bigdecimal}`, `{byte}`,
  `{short}`, `{long}`, `{biginteger}`, and the anonymous `{}` type already
  registered.
- `CucumberExpression` (class, `dist/CucumberExpression.d.ts`) — compiles one
  pattern string. Constructor: `new CucumberExpression(expression: string, parameterTypeRegistry: ParameterTypeRegistry)`.
  Exposes `.match(text: string): readonly Argument[] | null` and a `.regexp`
  getter (the underlying compiled `RegExp`).
- `Argument` (class, `dist/Argument.d.ts`) — one matched/typed capture group.
  Call `.getValue(thisObj: unknown): T | null` to run the parameter type's
  transform function and get the actual JS value. `thisObj` is passed through
  to the transform function's `this` (irrelevant for the stock parameter
  types; only matters for a custom type whose transform closes over `this`).
- `RegularExpression` (class) — same `Expression` interface (`match`/`source`)
  but takes a raw `RegExp` instead of a cucumber-expression string, for
  regex-based step patterns; not relevant to `{int}`/`{string}` syntax.
- `ExpressionFactory` — convenience `createExpression(expression: string | RegExp)`
  that picks `CucumberExpression` vs `RegularExpression` for you.

**Real call shape, confirmed by running it:**

```js
import { CucumberExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions'

const registry = new ParameterTypeRegistry()
const expr = new CucumberExpression(
  'a discount code {string} worth {int}% expiring in {string}',
  registry,
)

const args = expr.match('a discount code "SAVE10" worth 10% expiring in "1 hour"')
// args is an Array<Argument> (length 3), or `null` on no match
const values = args.map((a) => a.getValue(null))
// values === ['SAVE10', 10, '1 hour']
```

Actual script output (`node test.mjs`):

```
=== match() result ===
args === null? false
args.length 3
extracted values: [ 'SAVE10', 10, '1 hour' ]
  [0] string "SAVE10"
  [1] number 10
  [2] string "1 hour"
no match -> null
```

**Verdict:** No conflict (spec made no specific claim), but now confirmed:
a match is a two-step `new CucumberExpression(pattern, registry).match(text)`
→ `Argument[] | null`, then `.getValue(thisObj)` per argument to materialize
the typed value. `@effect-cucumber/gherkin` will need to wrap this in
something that (a) owns a `ParameterTypeRegistry`, (b) compiles/caches one
`CucumberExpression` per step pattern, and (c) maps `null` (no match) into
whatever "no step definition matched" signal the DSL uses.

---

## 2. Built-in parameter types and their JS output types

**Spec assumption:** ADR-EC-007 and BEH-EC-010 both assume `{int}` and
`{float}` produce values usable as numeric types with "no separate decoding
step required" (BEH-EC-010 literally requires coercion to `{int}`/`{float}`'s
"declared type"). The issue explicitly asks whether `{int}` might actually
be something like a bigint-capable type instead of `number`.

**What was found**, reading `dist/defineDefaultParameterTypes.js` (the source
that populates every fresh registry) and confirmed at runtime:

| Pattern | Regexp | JS constructor passed to `ParameterType` | Transform | Actual runtime type |
|---|---|---|---|---|
| `{int}` | `/-?\d+/` / `/\d+/` | `Number` | `(s) => Number(s)` | `number` (confirmed: `10` → `typeof 'number'`) |
| `{float}` | `/[-+]?(?:\d+(?:\.\d+)?\|\.\d+)(?:[E][+-]?\d+)?/` | `Number` | `(s) => parseFloat(s)` | `number` (confirmed: `31.50` → `31.5`, `typeof 'number'`) |
| `{word}` | `/[^\s]+/` | `String` | `(s) => s` | `string` (confirmed: `there` → `typeof 'string'`) |
| `{string}` | `/"([^"\\]*...)"\|'([^'\\]*...)'/ ` | `String` | unescapes `\"`/`\'` | `string` (confirmed: `"SAVE10"` → `'SAVE10'`) |

Also present but **not** mentioned in the spec: `{double}` (→ `number`,
same as float but `useForSnippets: false`), `{bigdecimal}` (→ `string`,
*not* a numeric type despite the name), `{byte}`/`{short}`/`{long}` (→
`number`), and `{biginteger}` (→ real JS `bigint`, via `BigInt(s)`). So the
library *does* ship a bigint-capable type — it's just called `{biginteger}`,
not `{int}`. `{int}` itself is always a plain `number` (subject to normal
JS float precision — arbitrarily large integer literals would silently lose
precision through `Number(s)`, same caveat as any JS number).

**Verdict:** Matches spec's assumption. `{int}` → real `number`, `{float}`
→ real `number`, `{string}`/`{word}` → real `string`. No bigint surprise for
`{int}` specifically; `{biginteger}` is the (separate, unmentioned-in-spec)
bigint escape hatch if `@effect-cucumber/gherkin` ever wants to expose it.

---

## 3. Custom parameter type registration API

**Spec assumption:** ADR-EC-007 says custom types come "via
`defineParameterExpression`"; the issue body calls this the
"`defineParameterExpression`/`defineParameterType`-equivalent."

**What was found:**

- There is **no** exported `defineParameterExpression` anywhere in the
  package. `dist/index.d.ts`'s full export list is: `Argument`,
  `CucumberExpression`, `CucumberExpressionGenerator`, `Expression`,
  `ExpressionFactory`, `GeneratedExpression`, `Group`, `Located`, `Node`,
  `NodeType`, `ParameterType`, `ParameterTypeRegistry`, `RegExps`,
  `RegularExpression`, `StringOrRegExp`, `Token`, `TokenType`. No function of
  that name exists, exported or internal (`defineDefaultParameterTypes` is
  the closest internal name, and it's for the *built-in* types only, not
  user-facing).
- There **is** a method literally named `defineParameterType` — but it's an
  **instance method on `ParameterTypeRegistry`**, not a standalone
  `defineParameterType(...)` function you call with name/regexp/transform
  directly:

  ```ts
  class ParameterTypeRegistry {
    defineParameterType(parameterType: ParameterType<unknown>): void
  }
  ```

  It takes an already-constructed `ParameterType` object, not raw
  name/regexp/transform arguments.
- The actual shape for defining a custom type is two steps:
  1. Construct a `ParameterType` (class, `dist/ParameterType.d.ts`):
     ```ts
     new ParameterType<T>(
       name: string | undefined,
       regexps: string | RegExp | readonly (string | RegExp)[],
       type: Constructor<T> | Factory<T> | null,
       transform?: (...match: string[]) => T | PromiseLike<T>,
       useForSnippets?: boolean,
       preferForRegexpMatch?: boolean,
       builtin?: boolean,
     )
     ```
  2. Register it: `registry.defineParameterType(parameterType)`.

Confirmed at runtime:

```js
class Color { constructor(name) { this.name = name } }
const registry3 = new ParameterTypeRegistry()
const colorType = new ParameterType('color', /red|blue|green/, Color, (s) => new Color(s), true, false)
registry3.defineParameterType(colorType)

const exprColor = new CucumberExpression('I paint the wall {color}', registry3)
exprColor.match('I paint the wall blue')[0].getValue(null)
// -> Color { name: 'blue' }, and (value instanceof Color) === true
```

Output: `custom type result: Color { name: 'blue' } true`.

Registering a duplicate name on the same registry throws, confirmed:
`registry3.defineParameterType(new ParameterType('color', /x/, String, s => s))`
→ `CucumberExpressionError: There is already a parameter type with name color`.

**Verdict — conflicts with the spec's naming.** `defineParameterExpression`
does not exist in this package at all; the ADR's naming should be corrected.
The real primitive is the `ParameterType` class constructor plus
`ParameterTypeRegistry#defineParameterType(parameterType)` (an instance
method requiring a pre-built `ParameterType`, not the bare
name/regexp/transform-argument function shape the ADR/issue implied).
`@effect-cucumber/gherkin`'s custom-type API (if/when it wraps this for
consumers) should either re-expose `ParameterType` directly or provide its
own thin wrapper — but it must not describe itself as wrapping
"`defineParameterExpression`," since upstream has no such export.

---

## 4. Registry statefulness — is it threaded through every call?

**Spec assumption:** Not stated explicitly in the ADR/behavior files; this
is exactly what the issue asks to pin down because it determines whether
`@effect-cucumber/gherkin` owns registry lifecycle.

**What was found:** `ParameterTypeRegistry` is an ordinary stateful instance
— there is no global/module-level registry and no static/singleton API.
Every `CucumberExpression` constructor call requires a registry instance to
be passed explicitly (`new CucumberExpression(pattern, registry)`), and a
registry's custom types are private to that instance. Confirmed at runtime
by creating two independent registries:

```js
const registry  = new ParameterTypeRegistry()   // only built-ins
const registry3 = new ParameterTypeRegistry()   // built-ins + custom {color}
registry3.defineParameterType(colorType)

new CucumberExpression('{color}', registry)     // throws
```

Output:

```
EXPECTED ERROR (registry1 has no color type): This Cucumber Expression has a problem at column 1:

{color}
^-----^
Undefined parameter type 'color'.
Please register a ParameterType for 'color'
```

This proves: (a) registries are not shared/global by default — each
`new ParameterTypeRegistry()` starts from a fresh copy of only the built-ins;
(b) a `CucumberExpression` permanently binds to whichever registry instance
it was constructed with; (c) mutating a registry (`defineParameterType`)
after constructing expressions from it does not retroactively affect
expressions from a *different* registry instance, but does affect *future*
`CucumberExpression`s built from the same instance — i.e., it's genuinely a
mutable, stateful, instance-scoped object, not an immutable value or a
context-free pure-function API.

**Verdict — this is new information the spec needs, not a conflict but a
gap.** `@effect-cucumber/gherkin` must own the lifecycle of (at minimum) one
`ParameterTypeRegistry` per consumer surface — realistically one per
`loadFeature`/suite, built once, with any custom parameter types (BEH-EC-010's
`{int}`/`{float}` coercion depends on the built-ins already being present,
which they always are) registered into it before any `CucumberExpression` is
constructed against it, since a `ParameterType` can't be added to a registry
after a duplicate name conflict, and expressions freeze to whatever registry
they were built with. If `@effect-cucumber/gherkin` allows per-Feature or
per-Rule custom parameter types (nothing in the spec asks for this yet, but
it's the shape upstream implies), it will need either one shared registry for
the whole run or an explicit merge/clone strategy — upstream provides no
"clone" or "merge two registries" helper.

---

## Summary table

| Question | Spec assumption | Confirmed reality | Match? |
|---|---|---|---|
| Compile/match API | Not named concretely | `new ParameterTypeRegistry()` → `new CucumberExpression(pattern, registry)` → `.match(text)` → `Argument[] \| null` → `.getValue(thisObj)` per arg | N/A (no conflict, now documented) |
| `{int}`/`{float}`/`{string}`/`{word}` output types | Real `number`/`string`, no decoding step needed | Confirmed: `{int}`→`number`, `{float}`→`number`, `{string}`/`{word}`→`string`; bigint exists only under the separate, unmentioned `{biginteger}` type | Match |
| Custom type registration named `defineParameterExpression`/`defineParameterType` | ADR-EC-007 names `defineParameterExpression` | No such export exists. Real API: `new ParameterType(name, regexps, type, transform, ...)` + `registry.defineParameterType(parameterType)` (instance method, not the ADR's implied free function) | **Conflict** — ADR-EC-007 naming should be corrected |
| Shared/global registry vs. threaded per-call | Not addressed in spec | Registry is a stateful, instance-scoped object explicitly passed into every `CucumberExpression` constructor; not global. `@effect-cucumber/gherkin` must own its lifecycle | Gap — spec should record this explicitly |

Branch: `research/cucumber-expressions-api`. Scratch repro left at
`/tmp/cucumber-expr-research` (outside this repo, not committed).
