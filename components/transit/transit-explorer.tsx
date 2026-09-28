'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { createTransitApp } from '@/core/composition'
import type { CostPolicyId } from '@/core/domain/routing/cost-policy'
import type { PathFinderId } from '@/core/domain/routing/path-finder'
import { createLocalProjection } from '@/presentation/render-model/projection'
import { buildRenderModel, buildRouteOverlay } from '@/presentation/render-model/render-model'
import { SimulationController } from '@/presentation/simulation/simulation-controller'
import { scenePalette } from '@/presentation/three/palette'
import { Itinerary } from './itinerary'
import { NetworkStatus } from './network-status'
import { RoutePlanner } from './route-planner'
import { SimulationBar } from './simulation-bar'
import { StationInspector } from './station-inspector'

const NetworkScene = dynamic(() => import('@/presentation/three/network-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
      Compilando escena 3D…
    </div>
  ),
})

const MapICGCScene = dynamic(() => import('@/presentation/mapicgc/mapicgc-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
      Cargando Mapa ICGC GL JS…
    </div>
  ),
})

export function TransitExplorer() {
  const app = useMemo(() => createTransitApp(), [])
  const { service } = app
  const controller = useMemo(() => new SimulationController(app.simulation), [app])

  const renderModel = useMemo(() => {
    const projection = createLocalProjection({
      origin: { latitude: 41.395, longitude: 2.165 },
      metersPerUnit: 100,
      verticalExaggeration: 12,
    })
    return buildRenderModel(service.network, service.index, projection)
  }, [service])

  const stations = useMemo(
    () => [...service.network.stations].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [service],
  )

  const [origin, setOrigin] = useState('sants-estacio')
  const [destination, setDestination] = useState('poblenou')
  const [policy, setPolicy] = useState<CostPolicyId>('fastest')
  const [algorithm, setAlgorithm] = useState<PathFinderId>('astar')
  const [selectedStation, setSelectedStation] = useState<string | null>(null)

  const result = useMemo(
    () => service.findRoute({ originStationId: origin, destinationStationId: destination, policy, algorithm }),
    [service, origin, destination, policy, algorithm],
  )

  const routeLegs = useMemo(
    () => (result.ok ? buildRouteOverlay(result.route, service.graph, renderModel, scenePalette.ink) : []),
    [result, service, renderModel],
  )

  const routeStationIds = useMemo(
    () => (result.ok ? new Set(result.route.legs.flatMap((l) => l.stationIds)) : null),
    [result],
  )

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <h1 className="sr-only">Xarxa 3D: red de transporte multimodal de Barcelona</h1>

      <div className="absolute inset-0 z-0">
        <MapICGCScene
          model={renderModel}
          network={service.network}
          routeLegs={routeLegs}
          routeStationIds={routeStationIds}
          originStationId={origin}
          destinationStationId={destination}
          selectedStationId={selectedStation}
          onSelectStation={setSelectedStation}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <NetworkScene
          model={renderModel}
          controller={controller}
          routeLegs={routeLegs}
          routeStationIds={routeStationIds}
          originStationId={origin}
          destinationStationId={destination}
          selectedStationId={selectedStation}
          onSelectStation={setSelectedStation}
          showTerrain={false}
        />
      </div>

      <aside className="absolute inset-x-2 bottom-2 z-20 flex max-h-[52dvh] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-96">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span aria-hidden="true" className="size-4 rotate-45 rounded-[2px] bg-primary" />
          <div>
            <p className="text-sm font-semibold leading-tight">Xarxa 3D</p>
            <p className="text-xs leading-tight text-muted-foreground">{service.network.name}</p>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <RoutePlanner
            stations={stations}
            origin={origin}
            destination={destination}
            policy={policy}
            algorithm={algorithm}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onSwap={() => {
              setOrigin(destination)
              setDestination(origin)
            }}
            onPolicyChange={setPolicy}
            onAlgorithmChange={setAlgorithm}
          />
          <Itinerary
            result={result}
            index={service.index}
            graph={service.graph}
            algorithmLabel={algorithm === 'astar' ? 'A*' : 'Dijkstra'}
          />
          <NetworkStatus service={service} />
        </div>
      </aside>

      <div className="absolute inset-x-2 top-2 flex flex-col items-end gap-3 md:inset-x-auto md:right-4 md:top-4 md:w-80">
        <SimulationBar controller={controller} />
        {selectedStation && (
          <div className="w-full">
            <StationInspector
              stationId={selectedStation}
              index={service.index}
              onClose={() => setSelectedStation(null)}
              onSetOrigin={() => {
                setOrigin(selectedStation)
                setSelectedStation(null)
              }}
              onSetDestination={() => {
                setDestination(selectedStation)
                setSelectedStation(null)
              }}
            />
          </div>
        )}
      </div>
    </main>
  )
}
