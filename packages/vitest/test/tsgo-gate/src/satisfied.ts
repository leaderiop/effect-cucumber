import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Dep extends Context.Service<Dep, { readonly n: number }>()("Dep") {}
class Svc extends Context.Service<Svc, { readonly m: number }>()("Svc") {}

const depLayer = Layer.succeed(Dep, { n: 1 })
const svcLayer = Layer.effect(Svc, Effect.map(Dep, (d) => ({ m: d.n })))

export const merged: Layer.Layer<Svc> = Layer.provide(svcLayer, depLayer)

export const run: Effect.Effect<number, never, Svc> = Effect.map(Svc, (s) => s.m)
