import type { GeoCoordinate } from '../network/model'
import { MinHeap } from '../shared/min-heap'
import type { CostPolicy } from './cost-policy'
import type { EdgeId, NodeId, RoutingGraph } from './routing-graph'

export type PathFinderId = 'dijkstra' | 'astar'

export interface PathSearch {
  readonly graph: RoutingGraph
  readonly sources: readonly NodeId[]
  readonly targets: readonly NodeId[]
  readonly targetLocation: GeoCoordinate
  readonly policy: CostPolicy
}

export interface PathSearchResult {
  readonly edgeIds: readonly EdgeId[]
  readonly cost: number
  /** Number of nodes settled; lets callers compare algorithm efficiency. */
  readonly expanded: number
}

export interface PathFinder {
  readonly id: PathFinderId
  find(search: PathSearch): PathSearchResult | null
}

/**
 * Multi-source / multi-target best-first search. Sources model "access" (any platform of
 * the origin station) and targets model "egress" (any platform of the destination).
 */
function bestFirstSearch(search: PathSearch, useHeuristic: boolean): PathSearchResult | null {
  const { graph, sources, targets, targetLocation, policy } = search
  const targetSet = new Set(targets)
  const distance = new Map<NodeId, number>()
  const cameFrom = new Map<NodeId, EdgeId>()
  const settled = new Set<NodeId>()
  const open = new MinHeap<NodeId>()

  const h = (id: NodeId) =>
    useHeuristic ? policy.heuristic(graph.node(id).location, targetLocation) : 0

  for (const source of sources) {
    distance.set(source, 0)
    open.push(source, h(source))
  }

  let expanded = 0
  while (open.size > 0) {
    const current = open.pop()!.value
    if (settled.has(current)) continue
    settled.add(current)
    expanded++

    if (targetSet.has(current)) {
      const edgeIds: EdgeId[] = []
      let cursor = current
      while (cameFrom.has(cursor)) {
        const edgeId = cameFrom.get(cursor)!
        edgeIds.push(edgeId)
        cursor = graph.edge(edgeId).source
      }
      edgeIds.reverse()
      return { edgeIds, cost: distance.get(current)!, expanded }
    }

    const base = distance.get(current)!
    for (const edgeId of graph.outgoing(current)) {
      const edge = graph.edge(edgeId)
      if (settled.has(edge.target)) continue
      const cost = policy.edgeCost(edge)
      if (cost === null) continue
      const candidate = base + cost
      if (candidate < (distance.get(edge.target) ?? Infinity)) {
        distance.set(edge.target, candidate)
        cameFrom.set(edge.target, edgeId)
        open.push(edge.target, candidate + h(edge.target))
      }
    }
  }

  return null
}

export const dijkstraPathFinder: PathFinder = {
  id: 'dijkstra',
  find: (search) => bestFirstSearch(search, false),
}

export const aStarPathFinder: PathFinder = {
  id: 'astar',
  find: (search) => bestFirstSearch(search, true),
}

export const PATH_FINDERS: Record<PathFinderId, PathFinder> = {
  dijkstra: dijkstraPathFinder,
  astar: aStarPathFinder,
}
