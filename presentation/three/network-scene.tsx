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
  showTerrain?: boolean
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
  showTerrain = false,
}: NetworkSceneProps) {
  const labelElements = useRef(new Map<string, HTMLElement>())
  const hasRoute = routeLegs.length > 0

  const stationById = useMemo(() => new Map(model.stations.map((s) => [s.id, s])), [model])
  const origin = stationById.get(originStationId)?.surface ?? null
  const destination = stationById.get(destinationStationId)?.surface ?? null

  // Frame the network dynamically derived from station bounding box.
  const framing = useMemo(() => {
    if (model.stations.length === 0) {
      return { camera: [0, 100, 100] as const, target: [0, 0, 0] as const, maxDistance: 250 }
    }
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const s of model.stations) {
      if (s.surface[0] < minX) minX = s.surface[0]
      if (s.surface[0] > maxX) maxX = s.surface[0]
      if (s.surface[2] < minZ) minZ = s.surface[2]
      if (s.surface[2] > maxZ) maxZ = s.surface[2]
    }

    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2
    const width = maxX - minX
    const depth = maxZ - minZ
    const size = Math.max(width, depth, 50)

    const wide = typeof window !== 'undefined' && window.innerWidth >= 768

    const target: readonly [number, number, number] = wide
      ? [centerX - width * 0.1, -1, centerZ]
      : [centerX, -1, centerZ + depth * 0.1]

    const camera: readonly [number, number, number] = wide
      ? [centerX, size * 0.85, centerZ + size * 0.85]
      : [centerX, size * 1.3, centerZ + size * 1.1]

    const maxDistance = Math.max(250, size * 2.5)

    return { camera, target, maxDistance }
  }, [model])

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
    <div className="relative h-full w-full pointer-events-none">
      <Canvas
        className="pointer-events-auto"
        camera={{ position: [...framing.camera], fov: 38, near: 0.1, far: 1000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => onSelectStation(null)}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[20, 40, 15]} intensity={1.4} />
        <hemisphereLight args={[scenePalette.paper, scenePalette.ground, 0.4]} />

        {showTerrain && <TerrainLayer />}

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
          maxDistance={framing.maxDistance}
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
