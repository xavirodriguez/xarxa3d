'use client'

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { vehicleSpan } from '@/core/domain/simulation/simulation'
import type { RenderModel } from '../render-model/render-model'
import type { SimulationController } from '../simulation/simulation-controller'

const dummy = new THREE.Object3D()
const from = new THREE.Vector3()
const to = new THREE.Vector3()
const color = new THREE.Color()

export function VehiclesLayer({
  model,
  controller,
}: {
  model: RenderModel
  controller: SimulationController
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = controller.state.vehicles.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    controller.state.vehicles.forEach((v, i) => {
      color.set(model.lineColor.get(v.lineId) ?? '#888888')
      mesh.setColorAt(i, color)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [controller, model])

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh) return
    controller.advance(delta)
    const { vehicles } = controller.state
    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i]
      const line = controller.model.topology.get(vehicle.lineId)!
      const span = vehicleSpan(vehicle, line)
      from.set(...model.platformPosition.get(span.from)!)
      to.set(...model.platformPosition.get(span.to)!)
      dummy.position.lerpVectors(from, to, span.t)
      dummy.position.y += 0.18
      if (from.distanceToSquared(to) > 1e-6) dummy.lookAt(to.x, to.y + 0.18, to.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.26, 0.26, 0.9]} />
      <meshStandardMaterial roughness={0.35} metalness={0.2} emissiveIntensity={0.2} />
    </instancedMesh>
  )
}
