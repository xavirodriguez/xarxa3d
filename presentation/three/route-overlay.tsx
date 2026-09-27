'use client'

import { Line } from '@react-three/drei'
import type { RenderRouteLeg } from '../render-model/render-model'
import type { WorldCoordinate } from '../render-model/projection'
import { scenePalette } from './palette'

function Pin({ position, color }: { position: WorldCoordinate; color: string }) {
  const [x, , z] = position
  const height = 3.2
  return (
    <group position={[x, 0, z]}>
      <Line points={[[0, 0, 0], [0, height, 0]]} color={color} lineWidth={2} />
      <mesh position={[0, height, 0]}>
        <sphereGeometry args={[0.38, 20, 14]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    </group>
  )
}

export function RouteOverlay({
  legs,
  origin,
  destination,
}: {
  legs: readonly RenderRouteLeg[]
  origin: WorldCoordinate | null
  destination: WorldCoordinate | null
}) {
  return (
    <group>
      {legs.map((leg, i) =>
        leg.points.length > 1 ? (
          <Line
            key={i}
            points={leg.points as [number, number, number][]}
            color={leg.color}
            lineWidth={leg.dashed ? 3 : 7}
            dashed={leg.dashed}
            dashSize={0.2}
            gapSize={0.14}
          />
        ) : null,
      )}
      {origin && <Pin position={origin} color={scenePalette.ink} />}
      {destination && <Pin position={destination} color={scenePalette.signal} />}
    </group>
  )
}
