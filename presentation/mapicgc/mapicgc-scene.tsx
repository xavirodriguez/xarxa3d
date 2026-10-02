'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Config, Map as MapICGC } from 'mapicgc-gl-js'
import * as THREE from 'three'
import type { TransportNetwork } from '@/core/domain/network/model'
import { vehicleSpan } from '@/core/domain/simulation/simulation'
import type { RenderModel, RenderRouteLeg } from '../render-model/render-model'
import { lngLatToMercator } from '../render-model/projection'
import type { SimulationController } from '../simulation/simulation-controller'
import { scenePalette } from '../three/palette'

export interface MapICGCSceneProps {
  model: RenderModel
  network: TransportNetwork
  routeLegs: readonly RenderRouteLeg[]
  routeStationIds: ReadonlySet<string> | null
  originStationId: string
  destinationStationId: string
  selectedStationId: string | null
  onSelectStation: (stationId: string | null) => void
  controller?: SimulationController
}

export default function MapICGCScene({
  model,
  network,
  routeLegs,
  routeStationIds,
  originStationId,
  destinationStationId,
  selectedStationId,
  onSelectStation,
  controller,
}: MapICGCSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const labelContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapICGC | null>(null)
  const customLayerRef = useRef<any>(null)
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [icgcConfig, setIcgcConfig] = useState<any>(null)
  const [currentStyle, setCurrentStyle] = useState<string>('TOPO')

  // Calculate center origin for Web Mercator scale
  const originGeo = useMemo(() => {
    let sumLat = 0
    let sumLon = 0
    const count = network.stations.length
    for (const s of network.stations) {
      sumLat += s.location.latitude
      sumLon += s.location.longitude
    }
    return count > 0
      ? { latitude: sumLat / count, longitude: sumLon / count }
      : { latitude: 41.395, longitude: 2.165 }
  }, [network])

  // Map station and platform IDs to domain coordinates
  const stationMap = useRef(new Map(network.stations.map((s) => [s.id, s])))
  const platformMap = useRef(new Map(network.platforms.map((p) => [p.id, p])))

  useEffect(() => {
    stationMap.current = new Map(network.stations.map((s) => [s.id, s]))
    platformMap.current = new Map(network.platforms.map((p) => [p.id, p]))
  }, [network])

  // Refs for dynamic prop updates inside the custom layer
  const propsRef = useRef({
    model,
    network,
    routeLegs,
    routeStationIds,
    originStationId,
    destinationStationId,
    selectedStationId,
    controller,
  })

  useEffect(() => {
    propsRef.current = {
      model,
      network,
      routeLegs,
      routeStationIds,
      originStationId,
      destinationStationId,
      selectedStationId,
      controller,
    }
    if (customLayerRef.current?.update3DObjects) {
      customLayerRef.current.update3DObjects()
    }
  }, [model, network, routeLegs, routeStationIds, originStationId, destinationStationId, selectedStationId, controller])

  // DOM station labels list
  const labelledStations = useMemo(() => {
    return network.stations.filter(
      (s) =>
        s.id === selectedStationId ||
        s.id === originStationId ||
        s.id === destinationStationId ||
        (routeStationIds && routeStationIds.has(s.id)),
    )
  }, [network, selectedStationId, originStationId, destinationStationId, routeStationIds])

  // Direct DOM label repositioning on map move/render (bypassing React re-renders)
  const updateLabelPositions = () => {
    const map = mapRef.current
    if (!map) return

    for (const s of labelledStations) {
      const el = labelRefs.current.get(s.id)
      if (!el) continue
      const point = map.project([s.location.longitude, s.location.latitude])
      el.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${point.y - 12}px)`
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    let isCancelled = false

    async function init() {
      try {
        const data = await Config.getConfigICGC()
        if (isCancelled) return
        setIcgcConfig(data)

        const styleUrl =
          data.Styles?.[currentStyle] ||
          data.Styles?.TOPO ||
          'https://geoserveis.icgc.cat/styles/mapa-base-topografic.json'

        const mapInstance = new MapICGC({
          container: containerRef.current!,
          style: styleUrl,
          maxZoom: 19,
          hash: false,
          pitch: 35,
          bearing: -10,
        })

        mapRef.current = mapInstance

        mapInstance.on('load', () => {
          if (isCancelled) return

          // Fit bounds to cover all network stations
          if (network.stations.length > 0) {
            let minLon = Infinity
            let minLat = Infinity
            let maxLon = -Infinity
            let maxLat = -Infinity
            for (const s of network.stations) {
              if (s.location.longitude < minLon) minLon = s.location.longitude
              if (s.location.longitude > maxLon) maxLon = s.location.longitude
              if (s.location.latitude < minLat) minLat = s.location.latitude
              if (s.location.latitude > maxLat) maxLat = s.location.latitude
            }
            try {
              mapInstance.fitBounds(
                [
                  [minLon, minLat],
                  [maxLon, maxLat],
                ],
                { padding: 80, animate: false },
              )
            } catch (e) {
              console.warn('Could not fit map bounds:', e)
            }
          }

          // Add ICGC controls
          try {
            mapInstance.addNavigationControl()
          } catch (e) {}
          try {
            mapInstance.addGeolocateControl(
              { positionOptions: { enableHighAccuracy: true }, trackUserLocation: true },
              'bottom-right',
            )
          } catch (e) {}

          // Create Three.js 3D Custom Layer
          const customLayer = createThreeCustomLayer({
            originGeo,
            propsRef,
          })

          customLayerRef.current = customLayer
          try {
            mapInstance.addLayer(customLayer)
          } catch (err) {
            console.error('Failed to add 3D custom layer:', err)
          }

          // Add GeoJSON 2D overlays
          setupGeoJSONLayers(mapInstance)

          // Event listeners for label updates and station selection
          mapInstance.on('move', updateLabelPositions)
          mapInstance.on('render', updateLabelPositions)
          updateLabelPositions()

          mapInstance.on('click', (e: any) => {
            // Check 2D station features first
            const features = mapInstance.queryRenderedFeatures(e.point, {
              layers: ['transit-stations-layer'],
            })
            if (features && features.length > 0) {
              const stationId = features[0].properties.id
              onSelectStation(stationId)
            } else {
              onSelectStation(null)
            }
          })
        })
      } catch (err) {
        console.error('Failed to initialize MapICGC:', err)
      }
    }

    init()

    return () => {
      isCancelled = true
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch (e) {}
        mapRef.current = null
      }
    }
  }, [])

  // Reposition labels when labelledStations change
  useEffect(() => {
    updateLabelPositions()
  }, [labelledStations])

  // Update GeoJSON layers when props change
  const setupGeoJSONLayers = (map: any) => {
    if (!map || !map.isStyleLoaded?.()) return

    const { originStationId, destinationStationId, selectedStationId, routeStationIds } = propsRef.current

    // 1. Build Lines GeoJSON
    const lineFeatures = network.lines.map((line) => {
      const coords = line.platformSequence
        .map((pid) => {
          const p = platformMap.current.get(pid)
          if (!p) return null
          const st = stationMap.current.get(p.stationId)
          if (!st) return null
          return [st.location.longitude, st.location.latitude]
        })
        .filter((c): c is [number, number] => c !== null)

      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { id: line.id, code: line.code, name: line.name, color: line.color },
      }
    })

    const linesGeoJSON = { type: 'FeatureCollection', features: lineFeatures }

    if (map.getSource('transit-lines')) {
      map.getSource('transit-lines').setData(linesGeoJSON)
    } else {
      map.addSource('transit-lines', { type: 'geojson', data: linesGeoJSON })
      map.addLayer({
        id: 'transit-lines-layer',
        type: 'line',
        source: 'transit-lines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.75 },
      })
    }

    // 2. Build Stations GeoJSON
    const stationFeatures = network.stations.map((station) => {
      const isOrigin = station.id === originStationId
      const isDestination = station.id === destinationStationId
      const isSelected = station.id === selectedStationId
      const isRoute = routeStationIds ? routeStationIds.has(station.id) : false

      let markerColor = '#1f2937'
      if (isOrigin || isDestination) markerColor = '#f97316'
      else if (isSelected) markerColor = '#2563eb'
      else if (isRoute) markerColor = '#10b981'

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.location.longitude, station.location.latitude] },
        properties: {
          id: station.id,
          name: station.name,
          color: markerColor,
          isOrigin,
          isDestination,
          isSelected,
          isRoute,
          radius: isOrigin || isDestination || isSelected ? 8 : 5,
        },
      }
    })

    const stationsGeoJSON = { type: 'FeatureCollection', features: stationFeatures }

    if (map.getSource('transit-stations')) {
      map.getSource('transit-stations').setData(stationsGeoJSON)
    } else {
      map.addSource('transit-stations', { type: 'geojson', data: stationsGeoJSON })
      map.addLayer({
        id: 'transit-stations-layer',
        type: 'circle',
        source: 'transit-stations',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['get', 'radius'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.on('mouseenter', 'transit-stations-layer', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'transit-stations-layer', () => {
        map.getCanvas().style.cursor = ''
      })
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded && map.isStyleLoaded()) {
      setupGeoJSONLayers(map)
    } else if (map.once) {
      map.once('styledata', () => setupGeoJSONLayers(map))
    }
  }, [network, routeStationIds, originStationId, destinationStationId, selectedStationId])

  // Style change handler
  const handleStyleChange = (styleKey: string) => {
    setCurrentStyle(styleKey)
    if (icgcConfig && mapRef.current) {
      const styleUrl = icgcConfig.Styles?.[styleKey]
      if (styleUrl) {
        mapRef.current.once('styledata', () => {
          setupGeoJSONLayers(mapRef.current)
          if (customLayerRef.current) {
            try {
              const currentMap = mapRef.current
              if (currentMap && !currentMap.getLayer('3d-transit-layer')) {
                currentMap.addLayer(customLayerRef.current)
              }
            } catch (e) {}
          }
        })
        mapRef.current.setStyle(styleUrl)
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* DOM Station Labels Overlay */}
      <div ref={labelContainerRef} className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {labelledStations.map((lbl) => (
          <div
            key={lbl.id}
            ref={(el) => {
              if (el) labelRefs.current.set(lbl.id, el)
              else labelRefs.current.delete(lbl.id)
            }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-md bg-card/90 px-2 py-1 font-sans text-[11px] font-semibold text-card-foreground shadow-md ring-1 ring-border transition-transform duration-75"
          >
            {lbl.name}
          </div>
        ))}
      </div>

      {/* Style selector overlay */}
      {icgcConfig?.Styles && (
        <div className="absolute top-3 left-3 md:left-[25rem] z-20 flex flex-wrap gap-1 rounded-lg border border-border bg-card/90 p-1.5 shadow-md backdrop-blur-sm">
          {Object.keys(icgcConfig.Styles)
            .filter((key) => typeof icgcConfig.Styles[key] === 'string')
            .map((styleKey) => (
              <button
                key={styleKey}
                type="button"
                onClick={() => handleStyleChange(styleKey)}
                className={`rounded px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                  currentStyle === styleKey
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {styleKey}
              </button>
            ))}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-3 z-20 rounded bg-card/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm border border-border/50">
        © Institut Cartogràfic i Geològic de Catalunya (MapICGC GL JS)
      </div>
    </div>
  )
}

/** Factory for Three.js Custom Layer in MapICGC GL JS */
function createThreeCustomLayer({
  originGeo,
  propsRef,
}: {
  originGeo: { latitude: number; longitude: number }
  propsRef: React.MutableRefObject<any>
}) {
  let camera: THREE.PerspectiveCamera
  let scene: THREE.Scene
  let renderer: THREE.WebGLRenderer
  let mapInstance: MapICGC

  // Group references
  let linesGroup: THREE.Group
  let platformsGroup: THREE.Group
  let shaftsGroup: THREE.Group
  let markersGroup: THREE.Group
  let routeGroup: THREE.Group
  let vehiclesMesh: THREE.InstancedMesh | null = null

  // Reusable temporaries
  const dummy = new THREE.Object3D()
  const fromVec = new THREE.Vector3()
  const toVec = new THREE.Vector3()
  const colorTmp = new THREE.Color()

  let lastSimTime = performance.now()

  return {
    id: '3d-transit-layer',
    type: 'custom' as const,
    renderingMode: '3d' as const,

    onAdd(map: MapICGC, gl: WebGLRenderingContext) {
      mapInstance = map
      camera = new THREE.PerspectiveCamera()
      scene = new THREE.Scene()

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
      scene.add(ambientLight)

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.4)
      dirLight.position.set(200, 500, 300)
      scene.add(dirLight)

      const hemiLight = new THREE.HemisphereLight(scenePalette.paper, scenePalette.ground, 0.5)
      scene.add(hemiLight)

      // Main groups
      linesGroup = new THREE.Group()
      platformsGroup = new THREE.Group()
      shaftsGroup = new THREE.Group()
      markersGroup = new THREE.Group()
      routeGroup = new THREE.Group()

      scene.add(linesGroup)
      scene.add(platformsGroup)
      scene.add(shaftsGroup)
      scene.add(markersGroup)
      scene.add(routeGroup)

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      renderer.autoClear = false

      this.update3DObjects()
    },

    update3DObjects() {
      if (!scene) return

      const { model, routeLegs, routeStationIds, originStationId, destinationStationId, selectedStationId, controller } =
        propsRef.current

      const hasRoute = routeLegs && routeLegs.length > 0

      // 1. Build Lines & Transfers
      linesGroup.clear()
      model.lines.forEach((line: any) => {
        if (line.points.length < 2) return
        const curvePoints = line.points.map((p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2]))
        const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.2)
        const geometry = new THREE.TubeGeometry(curve, curvePoints.length * 4, 6, 8, false)
        const material = new THREE.MeshStandardMaterial({
          color: line.color,
          roughness: 0.35,
          metalness: 0.1,
          transparent: true,
          opacity: hasRoute ? 0.25 : 0.9,
        })
        linesGroup.add(new THREE.Mesh(geometry, material))
      })

      model.transfers.forEach((t: any) => {
        const points = [
          new THREE.Vector3(t.points[0][0], t.points[0][1], t.points[0][2]),
          new THREE.Vector3(t.points[1][0], t.points[1][1], t.points[1][2]),
        ]
        const geom = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineDashedMaterial({
          color: scenePalette.ink,
          dashSize: 4,
          gapSize: 3,
          transparent: true,
          opacity: hasRoute ? 0.15 : 0.5,
        })
        const line = new THREE.Line(geom, mat)
        line.computeLineDistances()
        linesGroup.add(line)
      })

      // 2. Build Platforms
      platformsGroup.clear()
      const platformGeom = new THREE.SphereGeometry(10, 16, 12)
      model.platforms.forEach((p: any) => {
        const active = !routeStationIds || routeStationIds.has(p.stationId)
        const mat = new THREE.MeshStandardMaterial({
          color: active ? p.color : scenePalette.gridMajor,
          roughness: 0.4,
          metalness: 0.1,
        })
        const mesh = new THREE.Mesh(platformGeom, mat)
        mesh.position.set(p.position[0], p.position[1], p.position[2])
        if (!active) mesh.scale.setScalar(0.6)
        platformsGroup.add(mesh)
      })

      // 3. Build Station Shafts
      shaftsGroup.clear()
      const shaftPositions: number[] = []
      model.stations.forEach((s: any) => {
        const [x, , z] = s.surface
        const ownPlatforms = model.platforms.filter((p: any) => p.stationId === s.id)
        const top = Math.max(0, ...ownPlatforms.map((p: any) => p.position[1]))
        shaftPositions.push(x, top, z, x, s.lowestY, z)
      })
      const shaftGeom = new THREE.BufferGeometry()
      shaftGeom.setAttribute('position', new THREE.Float32BufferAttribute(shaftPositions, 3))
      const shaftMat = new THREE.LineBasicMaterial({
        color: scenePalette.shaft,
        transparent: true,
        opacity: hasRoute ? 0.2 : 0.5,
      })
      shaftsGroup.add(new THREE.LineSegments(shaftGeom, shaftMat))

      // 4. Build Surface Markers
      markersGroup.clear()
      const markerGeom = new THREE.CylinderGeometry(14, 14, 3, 24)
      model.stations.forEach((s: any) => {
        const isSelected = s.id === selectedStationId
        const isOrigin = s.id === originStationId
        const isDest = s.id === destinationStationId

        let markerColor: string = scenePalette.ink
        if (isOrigin || isDest) markerColor = '#f97316'
        else if (isSelected) markerColor = '#2563eb'

        const mat = new THREE.MeshStandardMaterial({
          color: markerColor,
          roughness: 0.6,
        })
        const mesh = new THREE.Mesh(markerGeom, mat)
        mesh.position.set(s.surface[0], 1, s.surface[2])
        if (s.interchange) mesh.scale.set(1.35, 1, 1.35)
        markersGroup.add(mesh)
      })

      // 5. Build Route Overlay
      routeGroup.clear()
      if (routeLegs && routeLegs.length > 0) {
        routeLegs.forEach((leg: RenderRouteLeg) => {
          if (leg.points.length < 2) return
          const curvePoints = leg.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
          const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.1)
          const geom = new THREE.TubeGeometry(curve, curvePoints.length * 4, leg.dashed ? 7 : 10, 8, false)
          const mat = new THREE.MeshStandardMaterial({
            color: leg.color,
            roughness: 0.3,
            emissive: leg.color,
            emissiveIntensity: 0.3,
          })
          routeGroup.add(new THREE.Mesh(geom, mat))
        })

        // Origin and Destination Pin Markers
        const originSt = model.stations.find((s: any) => s.id === originStationId)
        const destSt = model.stations.find((s: any) => s.id === destinationStationId)

        if (originSt) {
          addPin(routeGroup, originSt.surface, scenePalette.ink)
        }
        if (destSt) {
          addPin(routeGroup, destSt.surface, scenePalette.signal)
        }
      }

      // 6. Build Vehicles InstancedMesh
      if (vehiclesMesh) {
        scene.remove(vehiclesMesh)
        vehiclesMesh.geometry.dispose()
        vehiclesMesh = null
      }

      if (controller && controller.state.vehicles.length > 0) {
        const vehCount = controller.state.vehicles.length
        const vehGeom = new THREE.BoxGeometry(16, 8, 32)
        const vehMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 })
        vehiclesMesh = new THREE.InstancedMesh(vehGeom, vehMat, vehCount)

        controller.state.vehicles.forEach((v: any, i: number) => {
          colorTmp.set(model.lineColor.get(v.lineId) ?? '#888888')
          vehiclesMesh!.setColorAt(i, colorTmp)
        })
        if (vehiclesMesh.instanceColor) vehiclesMesh.instanceColor.needsUpdate = true
        scene.add(vehiclesMesh)
      }
    },

    render(gl: WebGLRenderingContext, matrix: number[]) {
      if (!renderer || !scene || !camera) return

      const originMerc = lngLatToMercator(originGeo.longitude, originGeo.latitude)
      const scale = originMerc.meterInMercator

      // Model transform matrix: local Three.js meters -> MapICGC Mercator
      const modelMatrix = new THREE.Matrix4().set(
        scale, 0,     0,     originMerc.x,
        0,     0,     scale, originMerc.y,
        0,     scale, 0,     0,
        0,     0,     0,     1,
      )

      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(modelMatrix)
      camera.matrixAutoUpdate = false

      // Update vehicle positions from simulation controller
      const { controller, model } = propsRef.current
      if (controller && vehiclesMesh) {
        const now = performance.now()
        const delta = Math.min((now - lastSimTime) / 1000, 0.1)
        lastSimTime = now

        controller.advance(delta)

        const vehicles = controller.state.vehicles
        for (let i = 0; i < vehicles.length; i++) {
          const vehicle = vehicles[i]
          const line = controller.model.topology.get(vehicle.lineId)
          if (!line) continue
          const span = vehicleSpan(vehicle, line)
          const fromPos = model.platformPosition.get(span.from)
          const toPos = model.platformPosition.get(span.to)
          if (!fromPos || !toPos) continue

          fromVec.set(fromPos[0], fromPos[1], fromPos[2])
          toVec.set(toPos[0], toPos[1], toPos[2])
          dummy.position.lerpVectors(fromVec, toVec, span.t)
          dummy.position.y += 2
          if (fromVec.distanceToSquared(toVec) > 1e-4) {
            dummy.lookAt(toVec.x, toVec.y + 2, toVec.z)
          }
          dummy.updateMatrix()
          vehiclesMesh.setMatrixAt(i, dummy.matrix)
        }
        vehiclesMesh.instanceMatrix.needsUpdate = true
      }

      renderer.resetState()
      renderer.render(scene, camera)

      // Repaint map frame when simulation is playing
      if (mapInstance && controller && !controller.state.paused) {
        mapInstance.triggerRepaint()
      }
    },
  }
}

/** Helper to add a 3D Pin marker at station surface */
function addPin(group: THREE.Group, position: readonly [number, number, number], color: string) {
  const [x, , z] = position
  const height = 50

  const pinGroup = new THREE.Group()
  pinGroup.position.set(x, 0, z)

  const linePoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height, 0)]
  const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints)
  const lineMat = new THREE.LineBasicMaterial({ color })
  pinGroup.add(new THREE.Line(lineGeom, lineMat))

  const sphereGeom = new THREE.SphereGeometry(12, 16, 12)
  const sphereMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 })
  const head = new THREE.Mesh(sphereGeom, sphereMat)
  head.position.set(0, height, 0)
  pinGroup.add(head)

  group.add(pinGroup)
}
