'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { RenderModel, RenderRouteLeg } from '../render-model/render-model'
import type { SimulationController } from '../simulation/simulation-controller'
import { LabelProjector, type LabelAnchor } from './label-projector'
import { LinesLayer, PlatformsLayer, StationMarkers, StationShafts } from './network-layers'
import { scenePalette } from './palette'
import { RouteOverlay } from './route-overlay'
import { TerrainLayer } from './terrain-layer'
import { VehiclesLayer } from './vehicles-layer'

export interface NetworkSceneProps {
  model: RenderModel
  controller: SimulationController
  routeLegs: readonly RenderRouteLeg[]
  routeStationIds: ReadonlySet<string> | null
  originStationId: string
  destinationStationId: string
  selectedStationId: string | null
  onSelectStation: (stationId: string | null) => void
}

export default function NetworkScene({
  model,
  controller,
  routeLegs,
  routeStationIds,
  originStationId,
  destinationStationId,
  selectedStationId,
  onSelectStation,
}: NetworkSceneProps) {
  const labelElements = useRef(new Map<string, HTMLElement>())
  const hasRoute = routeLegs.length > 0

  const stationById = useMemo(() => new Map(model.stations.map((s) => [s.id, s])), [model])
  const origin = stationById.get(originStationId)?.surface ?? null
  const destination = stationById.get(destinationStationId)?.surface ?? null

  // Frame the network in the area not covered by the side panel (desktop) or bottom sheet (mobile).
  const framing = useMemo(() => {
    const wide = typeof window !== 'undefined' && window.innerWidth >= 768
    return wide
      ? { camera: [-3, 56, 68] as const, target: [-12, -1, 3] as const }
      : { camera: [0, 125, 105] as const, target: [0, -1, 24] as const }
  }, [])

  const labelled = model.stations.filter(
    (s) =>
      s.id === selectedStationId ||
      (routeStationIds
        ? routeStationIds.has(s.id) &&
          (s.id === originStationId || s.id === destinationStationId || s.interchange)
        : s.interchange),
  )

  const anchors: LabelAnchor[] = labelled.map((s) => ({
    id: s.id,
    position: [
      s.surface[0],
      s.id === originStationId || s.id === destinationStationId ? 3.8 : 0.3,
      s.surface[2],
    ],
  }))

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [...framing.camera], fov: 38, near: 0.1, far: 500 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => onSelectStation(null)}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[20, 40, 15]} intensity={1.4} />
        <hemisphereLight args={[scenePalette.paper, scenePalette.ground, 0.4]} />

        <TerrainLayer />

        <LinesLayer model={model} dimmed={hasRoute} />
        <StationShafts model={model} dimmed={hasRoute} />
        <PlatformsLayer model={model} highlighted={routeStationIds} onSelectStation={onSelectStation} />
        <StationMarkers model={model} selectedStationId={selectedStationId} onSelectStation={onSelectStation} />
        <VehiclesLayer model={model} controller={controller} />
        <RouteOverlay legs={routeLegs} origin={origin} destination={destination} />
        <LabelProjector anchors={anchors} elements={labelElements} />

        <OrbitControls
          makeDefault
          target={[...framing.target]}
          enableDamping
          maxPolarAngle={Math.PI * 0.62}
          minDistance={8}
          maxDistance={140}
        />
      </Canvas>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {labelled.map((s) => (
          <span
            key={s.id}
            ref={(el) => {
              if (el) labelElements.current.set(s.id, el)
              else labelElements.current.delete(s.id)
            }}
            style={{ visibility: 'hidden' }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-sm bg-card/90 px-1.5 py-0.5 font-sans text-[11px] font-medium leading-none text-card-foreground shadow-sm ring-1 ring-border"
          >
            {s.name}
          </span>
        ))}
        <div className="absolute bottom-2 right-3 rounded bg-card/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm border border-border/50">
          © ICGC (CC BY 4.0)
        </div>
      </div>
    </div>
  )
}
