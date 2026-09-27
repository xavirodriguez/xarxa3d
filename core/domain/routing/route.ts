import type { ConnectionKind, LineId, StationId } from '../network/model'
import type { EdgeId, NodeId, RoutingGraph } from './routing-graph'

export interface RouteLeg {
  readonly kind: ConnectionKind
  readonly lineId?: LineId
  readonly fromStationId: StationId
  readonly toStationId: StationId
  readonly nodeIds: readonly NodeId[]
  readonly edgeIds: readonly EdgeId[]
  readonly stationIds: readonly StationId[]
  readonly durationSeconds: number
  readonly distanceMeters: number
}

export interface Route {
  readonly legs: readonly RouteLeg[]
  readonly edgeIds: readonly EdgeId[]
  readonly durationSeconds: number
  readonly distanceMeters: number
  readonly transfers: number
}

/** Groups a flat edge path into semantic legs (same line or same change). */
export function buildRoute(graph: RoutingGraph, edgeIds: readonly EdgeId[]): Route {
  const legs: RouteLeg[] = []
  let current: {
    kind: ConnectionKind
    lineId?: LineId
    nodeIds: NodeId[]
    edgeIds: EdgeId[]
    durationSeconds: number
    distanceMeters: number
  } | null = null

  const flush = () => {
    if (!current) return
    const stationIds = current.nodeIds
      .map((id) => graph.node(id).stationId)
      .filter((id, i, arr) => i === 0 || arr[i - 1] !== id)
    legs.push({
      ...current,
      fromStationId: stationIds[0],
      toStationId: stationIds[stationIds.length - 1],
      stationIds,
    })
  }

  for (const edgeId of edgeIds) {
    const edge = graph.edge(edgeId)
    const sameLeg =
      current &&
      current.kind === edge.kind &&
      (edge.kind !== 'ride' || current.lineId === edge.lineId)

    if (!sameLeg) {
      flush()
      current = {
        kind: edge.kind,
        lineId: edge.lineId,
        nodeIds: [edge.source],
        edgeIds: [],
        durationSeconds: 0,
        distanceMeters: 0,
      }
    }
    current!.nodeIds.push(edge.target)
    current!.edgeIds.push(edgeId)
    current!.durationSeconds += edge.durationSeconds
    current!.distanceMeters += edge.distanceMeters
  }
  flush()

  return {
    legs,
    edgeIds,
    durationSeconds: legs.reduce((sum, l) => sum + l.durationSeconds, 0),
    distanceMeters: legs.reduce((sum, l) => sum + l.distanceMeters, 0),
    transfers: legs.filter((l) => l.kind !== 'ride').length,
  }
}
