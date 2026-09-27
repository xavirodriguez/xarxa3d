import { haversineMeters, MAX_NETWORK_SPEED_MPS } from '../network/geo'
import type { GeoCoordinate } from '../network/model'
import type { RoutingEdge } from './routing-graph'

export type CostPolicyId = 'fastest' | 'fewest-transfers' | 'accessible' | 'shortest'

export interface CostPolicy {
  readonly id: CostPolicyId
  /** Returns null when the edge is not traversable under this policy. */
  edgeCost(edge: RoutingEdge): number | null
  /** Must be a lower bound of the remaining cost for A* to stay optimal. */
  heuristic(from: GeoCoordinate, to: GeoCoordinate): number
}

const TRANSFER_PENALTY_SECONDS = 600

const timeLowerBound = (from: GeoCoordinate, to: GeoCoordinate) =>
  haversineMeters(from, to) / MAX_NETWORK_SPEED_MPS

const isChange = (edge: RoutingEdge) => edge.kind === 'transfer' || edge.kind === 'walk'

export const fastestPolicy: CostPolicy = {
  id: 'fastest',
  edgeCost: (edge) => edge.durationSeconds,
  heuristic: timeLowerBound,
}

export const fewestTransfersPolicy: CostPolicy = {
  id: 'fewest-transfers',
  edgeCost: (edge) => edge.durationSeconds + (isChange(edge) ? TRANSFER_PENALTY_SECONDS : 0),
  heuristic: timeLowerBound,
}

export const accessiblePolicy: CostPolicy = {
  id: 'accessible',
  edgeCost: (edge) =>
    isChange(edge) && edge.accessibility !== 'step-free' ? null : edge.durationSeconds,
  heuristic: timeLowerBound,
}

export const shortestPolicy: CostPolicy = {
  id: 'shortest',
  edgeCost: (edge) => edge.distanceMeters,
  heuristic: haversineMeters,
}

export const COST_POLICIES: Record<CostPolicyId, CostPolicy> = {
  fastest: fastestPolicy,
  'fewest-transfers': fewestTransfersPolicy,
  accessible: accessiblePolicy,
  shortest: shortestPolicy,
}
