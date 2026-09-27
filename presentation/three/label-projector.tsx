'use client'

import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import * as THREE from 'three'
import type { WorldCoordinate } from '../render-model/projection'

export interface LabelAnchor {
  readonly id: string
  readonly position: WorldCoordinate
}

const v = new THREE.Vector3()

/** Projects 3D anchors to screen space and positions plain DOM labels rendered outside the canvas. */
export function LabelProjector({
  anchors,
  elements,
}: {
  anchors: readonly LabelAnchor[]
  elements: RefObject<Map<string, HTMLElement>>
}) {
  useFrame(({ camera, size }) => {
    const map = elements.current
    if (!map) return
    for (const anchor of anchors) {
      const el = map.get(anchor.id)
      if (!el) continue
      v.set(...anchor.position).project(camera)
      if (v.z > 1) {
        el.style.visibility = 'hidden'
        continue
      }
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.visibility = 'visible'
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`
    }
  })
  return null
}
