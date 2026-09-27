import { isInterchange, type NetworkIndex, type TransportNetwork } from '@/core/domain/network/model'
import type { Route } from '@/core/domain/routing/route'
import type { RoutingGraph } from '@/core/domain/routing/routing-graph'
import type { Projection, WorldCoordinate } from './projection'

export interface RenderStation {
  readonly id: string
  readonly name: string
  readonly surface: WorldCoordinate
  readonly lowestY: number
  readonly interchange: boolean
}

export interface RenderPlatform {
  readonly id: string
  readonly stationId: string
  readonly color: string
  readonly position: WorldCoordinate
}

export interface RenderLine {
  readonly id: string
  readonly color: string
  readonly points: readonly WorldCoordinate[]
}

export interface RenderSegment {
  readonly id: string
  readonly points: readonly [WorldCoordinate, WorldCoordinate]
}

export interface RenderModel {
  readonly stations: readonly RenderStation[]
  readonly platforms: readonly RenderPlatform[]
  readonly lines: readonly RenderLine[]
  readonly transfers: readonly RenderSegment[]
  readonly platformPosition: ReadonlyMap<string, WorldCoordinate>
  readonly lineColor: ReadonlyMap<string, string>
}

/** Presentation mapper: domain → render model. Three.js never sees domain entities. */
export function buildRenderModel(
  network: TransportNetwork,
  index: NetworkIndex,
  projection: Projection,
): RenderModel {
  const lineColor = new Map(network.lines.map((l) => [l.id, l.color]))
  const platformPosition = new Map<string, WorldCoordinate>()

  const platforms: RenderPlatform[] = network.platforms.map((p) => {
    const station = index.stations.get(p.stationId)!
    const position = projection.project(station.location, p.depthMeters)
    platformPosition.set(p.id, position)
    return { id: p.id, stationId: p.stationId, color: lineColor.get(p.lineId)!, position }
  })

  const stations: RenderStation[] = network.stations.map((s) => {
    const own = platforms.filter((p) => p.stationId === s.id)
    return {
      id: s.id,
      name: s.name,
      surface: projection.project(s.location, 0),
      lowestY: Math.min(0, ...own.map((p) => p.position[1])),
      interchange: isInterchange(index, s.id),
    }
  })

  const lines: RenderLine[] = network.lines.map((l) => ({
    id: l.id,
    color: l.color,
    points: l.platformSequence.map((pid) => platformPosition.get(pid)!),
  }))

  const seen = new Set<string>()
  const transfers: RenderSegment[] = []
  for (const c of network.connections) {
    if (c.kind === 'ride') continue
    const key = [c.from, c.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    transfers.push({
      id: c.id,
      points: [platformPosition.get(c.from)!, platformPosition.get(c.to)!],
    })
  }

  return { stations, platforms, lines, transfers, platformPosition, lineColor }
}

export interface RenderRouteLeg {
  readonly color: string
  readonly dashed: boolean
  readonly points: readonly WorldCoordinate[]
}

export function buildRouteOverlay(
  route: Route,
  graph: RoutingGraph,
  model: RenderModel,
  changeColor: string,
): RenderRouteLeg[] {
  return route.legs.map((leg) => ({
    color: leg.lineId ? model.lineColor.get(leg.lineId)! : changeColor,
    dashed: leg.kind !== 'ride',
    points: leg.nodeIds.map((id) => model.platformPosition.get(graph.node(id).platformId)!),
  }))
}
