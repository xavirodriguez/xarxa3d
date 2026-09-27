'use client'

import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { scenePalette } from './palette'

export interface TerrainLayerProps {
  readonly origin?: { latitude: number; longitude: number }
  readonly metersPerUnit?: number
  readonly verticalExaggeration?: number
}

interface Manifest {
  zoom: number
  bbox: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  }
}

const DEFAULT_ORIGIN = { latitude: 41.3935, longitude: 2.1715 }
const DEFAULT_METERS_PER_UNIT = 100
const DEFAULT_VERTICAL_EXAGGERATION = 12

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z))
const lat2tile = (lat: number, z: number) => {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z))
}

const tile2lon = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z)
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

export function TerrainLayer({
  origin = DEFAULT_ORIGIN,
  metersPerUnit = DEFAULT_METERS_PER_UNIT,
  verticalExaggeration = DEFAULT_VERTICAL_EXAGGERATION,
}: TerrainLayerProps) {
  const [terrainData, setTerrainData] = useState<{
    geometry: THREE.BufferGeometry
    texture: THREE.CanvasTexture
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadTerrain() {
      try {
        const manifestRes = await fetch('/terrain/manifest.json')
        if (!manifestRes.ok) return
        const manifest: Manifest = await manifestRes.json()

        const z = manifest.zoom
        const xMin = lon2tile(manifest.bbox.minLon, z)
        const xMax = lon2tile(manifest.bbox.maxLon, z)
        const yMin = lat2tile(manifest.bbox.maxLat, z)
        const yMax = lat2tile(manifest.bbox.minLat, z)

        const cols = xMax - xMin + 1
        const rows = yMax - yMin + 1

        const canvasWidth = cols * 256
        const canvasHeight = rows * 256

        const basemapCanvas = document.createElement('canvas')
        basemapCanvas.width = canvasWidth
        basemapCanvas.height = canvasHeight
        const basemapCtx = basemapCanvas.getContext('2d')

        const demCanvas = document.createElement('canvas')
        demCanvas.width = canvasWidth
        demCanvas.height = canvasHeight
        const demCtx = demCanvas.getContext('2d')

        if (!basemapCtx || !demCtx) return

        basemapCtx.fillStyle = scenePalette.paper
        basemapCtx.fillRect(0, 0, canvasWidth, canvasHeight)

        const tilePromises: Promise<void>[] = []

        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            const dx = (x - xMin) * 256
            const dy = (y - yMin) * 256

            const basemapPromise = new Promise<void>((resolve) => {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => {
                basemapCtx.drawImage(img, dx, dy, 256, 256)
                resolve()
              }
              img.onerror = () => resolve()
              img.src = `/terrain/basemap/${z}/${x}/${y}.png`
            })

            const demPromise = new Promise<void>((resolve) => {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => {
                demCtx.drawImage(img, dx, dy, 256, 256)
                resolve()
              }
              img.onerror = () => resolve()
              img.src = `/terrain/dem/${z}/${x}/${y}.png`
            })

            tilePromises.push(basemapPromise, demPromise)
          }
        }

        await Promise.all(tilePromises)
        if (cancelled) return

        const demImageData = demCtx.getImageData(0, 0, canvasWidth, canvasHeight)

        const metersPerDegLat = 111_320
        const metersPerDegLon = 111_320 * Math.cos((origin.latitude * Math.PI) / 180)

        const sampleHeight = (px: number, py: number): number => {
          const cx = Math.max(0, Math.min(canvasWidth - 1, Math.round(px)))
          const cy = Math.max(0, Math.min(canvasHeight - 1, Math.round(py)))
          const idx = (cy * canvasWidth + cx) * 4
          const r = demImageData.data[idx]
          const g = demImageData.data[idx + 1]
          const b = demImageData.data[idx + 2]
          const a = demImageData.data[idx + 3]
          if (a === 0 || (r === 0 && g === 0 && b === 0)) {
            return 0
          }
          return -10000 + (r * 65536 + g * 256 + b) * 0.1
        }

        const originTileX = ((origin.longitude + 180) / 360) * Math.pow(2, z)
        const originRad = (origin.latitude * Math.PI) / 180
        const originTileY =
          ((1 - Math.log(Math.tan(originRad) + 1 / Math.cos(originRad)) / Math.PI) / 2) * Math.pow(2, z)
        const originPx = (originTileX - xMin) * 256
        const originPy = (originTileY - yMin) * 256
        const hOrigin = sampleHeight(originPx, originPy)

        const gridCols = cols * 16
        const gridRows = rows * 16
        const numVertices = (gridCols + 1) * (gridRows + 1)

        const positions = new Float32Array(numVertices * 3)
        const uvs = new Float32Array(numVertices * 2)

        let vertIdx = 0
        let uvIdx = 0

        for (let j = 0; j <= gridRows; j++) {
          const vFrac = j / gridRows
          const fracY = yMin + vFrac * rows
          const py = vFrac * (canvasHeight - 1)
          const lat = tile2lat(fracY, z)
          const north = (lat - origin.latitude) * metersPerDegLat
          const worldZ = -north / metersPerUnit

          for (let i = 0; i <= gridCols; i++) {
            const uFrac = i / gridCols
            const fracX = xMin + uFrac * cols
            const px = uFrac * (canvasWidth - 1)
            const lon = tile2lon(fracX, z)
            const east = (lon - origin.longitude) * metersPerDegLon
            const worldX = east / metersPerUnit

            const heightMeters = sampleHeight(px, py)
            const worldY = ((heightMeters - hOrigin) * verticalExaggeration) / metersPerUnit

            positions[vertIdx] = worldX
            positions[vertIdx + 1] = worldY
            positions[vertIdx + 2] = worldZ
            vertIdx += 3

            uvs[uvIdx] = uFrac
            uvs[uvIdx + 1] = 1 - vFrac
            uvIdx += 2
          }
        }

        const indices: number[] = []
        for (let j = 0; j < gridRows; j++) {
          for (let i = 0; i < gridCols; i++) {
            const a = j * (gridCols + 1) + i
            const b = j * (gridCols + 1) + i + 1
            const c = (j + 1) * (gridCols + 1) + i
            const d = (j + 1) * (gridCols + 1) + i + 1

            indices.push(a, c, b)
            indices.push(c, d, b)
          }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        geometry.setIndex(indices)
        geometry.computeVertexNormals()

        const texture = new THREE.CanvasTexture(basemapCanvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true

        setTerrainData({ geometry, texture })
      } catch (e) {
        console.error('Failed to load terrain layer:', e)
      }
    }

    loadTerrain()

    return () => {
      cancelled = true
    }
  }, [origin, metersPerUnit, verticalExaggeration])

  useEffect(() => {
    return () => {
      if (terrainData) {
        terrainData.geometry.dispose()
        terrainData.texture.dispose()
      }
    }
  }, [terrainData])

  if (!terrainData) return null

  return (
    <group name="TerrainLayer">
      <mesh geometry={terrainData.geometry} receiveShadow castShadow>
        <meshStandardMaterial
          map={terrainData.texture}
          roughness={0.75}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
