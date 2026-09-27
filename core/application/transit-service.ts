import { indexNetwork, type NetworkIndex, type StationId, type TransportNetwork } from '../domain/network/model'
import { validateNetwork, type ValidationResult } from '../domain/network/validate'
import { COST_POLICIES, type CostPolicyId } from '../domain/routing/cost-policy'
import { PATH_FINDERS, type PathFinderId } from '../domain/routing/path-finder'
import { buildRoute, type Route } from '../domain/routing/route'
import {
  compileRoutingGraph,
  type RoutingGraph,
  type RoutingGraphFactory,
} from '../domain/routing/routing-graph'

export interface Clock {
  now(): number
}

export interface RouteRequest {
  readonly originStationId: StationId
  readonly destinationStationId: StationId
  readonly policy: CostPolicyId
  readonly algorithm: PathFinderId
}

export type RouteResult =
  | {
      readonly ok: true
      readonly route: Route
      readonly stats: { readonly expanded: number; readonly elapsedMs: number; readonly cost: number }
    }
  | { readonly ok: false; readonly reason: 'same-station' | 'unknown-station' | 'no-path' }

export interface TransitService {
  readonly network: TransportNetwork
  readonly index: NetworkIndex
  readonly validation: ValidationResult
  readonly graph: RoutingGraph
  findRoute(request: RouteRequest): RouteResult
}

export interface TransitServiceDeps {
  readonly network: TransportNetwork
  readonly graphFactory: RoutingGraphFactory
  readonly clock: Clock
}

export function createTransitService({ network, graphFactory, clock }: TransitServiceDeps): TransitService {
  const validation = validateNetwork(network)
  if (!validation.valid) {
    throw new Error(`Red inválida: ${validation.issues.map((i) => i.message).join('; ')}`)
  }
  const index = indexNetwork(network)
  const graph = compileRoutingGraph(network, graphFactory)

  function findRoute(request: RouteRequest): RouteResult {
    const origin = index.stations.get(request.originStationId)
    const destination = index.stations.get(request.destinationStationId)
    if (!origin || !destination) return { ok: false, reason: 'unknown-station' }
    if (origin.id === destination.id) return { ok: false, reason: 'same-station' }

    const started = clock.now()
    const result = PATH_FINDERS[request.algorithm].find({
      graph,
      sources: graph.nodesOfStation(origin.id),
      targets: graph.nodesOfStation(destination.id),
      targetLocation: destination.location,
      policy: COST_POLICIES[request.policy],
    })
    const elapsedMs = clock.now() - started

    if (!result) return { ok: false, reason: 'no-path' }
    return {
      ok: true,
      route: buildRoute(graph, result.edgeIds),
      stats: { expanded: result.expanded, elapsedMs, cost: result.cost },
    }
  }

  return { network, index, validation, graph, findRoute }
}
