import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Dep extends Context.Service<Dep, { readonly n: number }>()("Dep") {}
class Svc extends Context.Service<Svc, { readonly m: number }>()("Svc") {}

const svcLayer = Layer.effect(Svc, Effect.map(Dep, (d) => ({ m: d.n })))

// `svcLayer` is `Layer<Svc, never, Dep>` — `Dep` is unprovided. Annotating it
// as `Layer<Svc>` is exactly the mistake this project must catch at authoring
// time: a Scenario whose ambient Layer does not provide what a step needs.
export const merged: Layer.Layer<Svc> = Layer.merge(svcLayer, Layer.empty)
