import { createTransitService, type TransitService } from './application/transit-service'
import { createSimulationModel, type SimulationModel } from './domain/simulation/simulation'
import { barcelonaCompact } from './infrastructure/data/barcelona-generated'
import { graphologyGraphFactory } from './infrastructure/graphology/graphology-routing-graph'
import { importCompactNetwork } from './infrastructure/import/compact-importer'

export interface TransitApp {
  readonly service: TransitService
  readonly simulation: SimulationModel
}

/** Composition root: the only place that wires concrete adapters to domain ports. */
export function createTransitApp(): TransitApp {
  const network = importCompactNetwork(barcelonaCompact)
  const service = createTransitService({
    network,
    graphFactory: graphologyGraphFactory,
    clock: { now: () => performance.now() },
  })
  return { service, simulation: createSimulationModel(network, 4) }
}
