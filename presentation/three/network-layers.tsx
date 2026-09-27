'use client'

import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RenderModel } from '../render-model/render-model'
import { scenePalette } from './palette'

export function LinesLayer({ model, dimmed }: { model: RenderModel; dimmed: boolean }) {
  return (
    <group>
      {model.lines.map((line) => (
        <Line
          key={line.id}
          points={line.points as [number, number, number][]}
          color={line.color}
          lineWidth={3}
          transparent
          opacity={dimmed ? 0.22 : 1}
        />
      ))}
      {model.transfers.map((t) => (
        <Line
          key={t.id}
          points={[...t.points] as [number, number, number][]}
          color={scenePalette.ink}
          lineWidth={1}
          dashed
          dashSize={0.15}
          gapSize={0.12}
          transparent
          opacity={dimmed ? 0.15 : 0.55}
        />
      ))}
    </group>
  )
}

export function StationShafts({ model, dimmed }: { model: RenderModel; dimmed: boolean }) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    for (const s of model.stations) {
      const [x, , z] = s.surface
      const top = Math.max(0, ...model.platforms.filter((p) => p.stationId === s.id).map((p) => p.position[1]))
      positions.push(x, top, z, x, s.lowestY, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [model])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={scenePalette.shaft} transparent opacity={dimmed ? 0.2 : 0.5} />
    </lineSegments>
  )
}

const tmpObject = new THREE.Object3D()
const tmpColor = new THREE.Color()

export function PlatformsLayer({
  model,
  highlighted,
  onSelectStation,
}: {
  model: RenderModel
  highlighted: ReadonlySet<string> | null
  onSelectStation: (stationId: string) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    model.platforms.forEach((p, i) => {
      const active = !highlighted || highlighted.has(p.stationId)
      tmpObject.position.set(...p.position)
      tmpObject.scale.setScalar(active ? 1 : 0.6)
      tmpObject.updateMatrix()
      mesh.setMatrixAt(i, tmpObject.matrix)
      tmpColor.set(active ? p.color : scenePalette.gridMajor)
      mesh.setColorAt(i, tmpColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [model, highlighted])

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    onSelectStation(model.platforms[e.instanceId].stationId)
  }

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, model.platforms.length]}
      onClick={handleClick}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <sphereGeometry args={[0.32, 20, 14]} />
      <meshStandardMaterial roughness={0.45} metalness={0.05} />
    </instancedMesh>
  )
}

export function StationMarkers({
  model,
  selectedStationId,
  onSelectStation,
}: {
  model: RenderModel
  selectedStationId: string | null
  onSelectStation: (stationId: string) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    model.stations.forEach((s, i) => {
      tmpObject.position.set(s.surface[0], 0.03, s.surface[2])
      const scale = s.interchange ? 1.35 : 1
      tmpObject.scale.set(scale, 1, scale)
      tmpObject.updateMatrix()
      mesh.setMatrixAt(i, tmpObject.matrix)
      tmpColor.set(s.id === selectedStationId ? scenePalette.signal : scenePalette.ink)
      mesh.setColorAt(i, tmpColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [model, selectedStationId])

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, model.stations.length]}
      onClick={(e) => {
        e.stopPropagation()
        if (e.instanceId !== undefined) onSelectStation(model.stations[e.instanceId].id)
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <cylinderGeometry args={[0.2, 0.2, 0.05, 24]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  )
}
