import type {
  Accessibility,
  ConnectionId,
  ConnectionKind,
  GeoCoordinate,
  LineId,
  PlatformId,
  StationId,
  TransportMode,
  TransportNetwork,
} from '../network/model'

export type NodeId = string
export type EdgeId = string

export interface RoutingNode {
  readonly id: NodeId
  readonly platformId: PlatformId
  readonly stationId: StationId
  readonly lineId: LineId
  readonly mode: TransportMode
  readonly location: GeoCoordinate
}

export interface RoutingEdge {
  readonly id: EdgeId
  readonly connectionId: ConnectionId
  readonly source: NodeId
  readonly target: NodeId
  readonly kind: ConnectionKind
  readonly lineId?: LineId
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly accessibility?: Accessibility
}

/**
 * Port: the routing domain depends on this abstraction.
 * Concrete graph libraries (e.g. Graphology) live in infrastructure adapters.
 */
export interface RoutingGraph {
  readonly order: number
  readonly size: number
  node(id: NodeId): RoutingNode
  edge(id: EdgeId): RoutingEdge
  outgoing(id: NodeId): readonly EdgeId[]
  nodesOfStation(stationId: StationId): readonly NodeId[]
}

export interface RoutingGraphFactory {
  create(nodes: readonly RoutingNode[], edges: readonly RoutingEdge[]): RoutingGraph
}

/** Derives the routing representation from the semantic transport model. */
export function compileRoutingGraph(
  network: TransportNetwork,
  factory: RoutingGraphFactory,
): RoutingGraph {
  const stations = new Map(network.stations.map((s) => [s.id, s]))

  const nodes: RoutingNode[] = network.platforms.map((p) => ({
    id: p.id,
    platformId: p.id,
    stationId: p.stationId,
    lineId: p.lineId,
    mode: p.mode,
    location: stations.get(p.stationId)!.location,
  }))

  const edges: RoutingEdge[] = network.connections.map((c) => ({
    id: c.id,
    connectionId: c.id,
    source: c.from,
    target: c.to,
    kind: c.kind,
    lineId: c.kind === 'ride' ? c.lineId : undefined,
    durationSeconds: c.durationSeconds,
    distanceMeters: c.distanceMeters,
    accessibility: c.kind === 'ride' ? undefined : c.accessibility,
  }))

  return factory.create(nodes, edges)
}
