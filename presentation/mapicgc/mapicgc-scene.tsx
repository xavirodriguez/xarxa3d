'use client'

import { useEffect, useRef, useState } from 'react'
import { Config, Map } from 'mapicgc-gl-js'
import type { TransportNetwork } from '@/core/domain/network/model'
import type { RenderModel, RenderRouteLeg } from '../render-model/render-model'

export interface MapICGCSceneProps {
  model: RenderModel
  network: TransportNetwork
  routeLegs: readonly RenderRouteLeg[]
  routeStationIds: ReadonlySet<string> | null
  originStationId: string
  destinationStationId: string
  selectedStationId: string | null
  onSelectStation: (stationId: string | null) => void
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
}: MapICGCSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const [icgcConfig, setIcgcConfig] = useState<any>(null)
  const [currentStyle, setCurrentStyle] = useState<string>('TOPO')
  const [terrainEnabled, setTerrainEnabled] = useState<boolean>(true)

  // Map station and platform IDs to coordinates
  const stationMap = useRef(new Map(network.stations.map((s) => [s.id, s])))
  const platformMap = useRef(new Map(network.platforms.map((p) => [p.id, p])))

  useEffect(() => {
    stationMap.current = new Map(network.stations.map((s) => [s.id, s]))
    platformMap.current = new Map(network.platforms.map((p) => [p.id, p]))
  }, [network])

  useEffect(() => {
    if (!containerRef.current) return
    let isCancelled = false

    async function init() {
      try {
        const data = await Config.getConfigICGC()
        if (isCancelled) return
        setIcgcConfig(data)

        const styleUrl = data.Styles?.[currentStyle] || data.Styles?.TOPO || 'https://geoserveis.icgc.cat/styles/mapa-base-topografic.json'

        const mapInstance = new Map({
          container: containerRef.current!,
          style: styleUrl,
          center: [2.1715, 41.3935], // Barcelona
          zoom: 12,
          maxZoom: 19,
          hash: false,
          pitch: 30,
        })

        mapRef.current = mapInstance

        mapInstance.on('load', () => {
          if (isCancelled) return

          // Add 3D terrain
          try {
            if (data.Terrains?.WORLD30M) {
              mapInstance.addTerrainICGC(data.Terrains.WORLD30M, 'bottom-right')
            }
          } catch (e) {
            console.warn('Could not add ICGC terrain:', e)
          }

          // Add MapICGC controls
          try {
            mapInstance.addNavigationControl()
          } catch (e) {}
          try {
            mapInstance.addGeolocateControl(
              { positionOptions: { enableHighAccuracy: true }, trackUserLocation: true },
              'bottom-right',
            )
          } catch (e) {}
          try {
            mapInstance.addGeocoderICGC({ zoom: 14 })
          } catch (e) {}
          try {
            mapInstance.addExportControl()
          } catch (e) {}
          try {
            mapInstance.addMouseCoordControl()
          } catch (e) {}

          // Add sources and layers for subway network
          setupNetworkLayers(mapInstance)
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

  // Function to setup or update GeoJSON layers
  const setupNetworkLayers = (map: any) => {
    if (!map || !map.isStyleLoaded?.()) return

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
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
        properties: {
          id: line.id,
          code: line.code,
          name: line.name,
          color: line.color,
        },
      }
    })

    const linesGeoJSON = {
      type: 'FeatureCollection',
      features: lineFeatures,
    }

    if (map.getSource('transit-lines')) {
      map.getSource('transit-lines').setData(linesGeoJSON)
    } else {
      map.addSource('transit-lines', {
        type: 'geojson',
        data: linesGeoJSON,
      })

      map.addLayer({
        id: 'transit-lines-layer',
        type: 'line',
        source: 'transit-lines',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.85,
        },
      })
    }

    // 2. Build Stations GeoJSON
    const stationFeatures = network.stations.map((station) => {
      const isOrigin = station.id === originStationId
      const isDestination = station.id === destinationStationId
      const isSelected = station.id === selectedStationId
      const isRoute = routeStationIds ? routeStationIds.has(station.id) : false

      let markerColor = '#1f2937' // dark slate default
      if (isOrigin || isDestination) markerColor = '#f97316' // orange primary
      else if (isSelected) markerColor = '#2563eb' // blue selection
      else if (isRoute) markerColor = '#10b981' // green route

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [station.location.longitude, station.location.latitude],
        },
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

    const stationsGeoJSON = {
      type: 'FeatureCollection',
      features: stationFeatures,
    }

    if (map.getSource('transit-stations')) {
      map.getSource('transit-stations').setData(stationsGeoJSON)
    } else {
      map.addSource('transit-stations', {
        type: 'geojson',
        data: stationsGeoJSON,
      })

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

      map.addLayer({
        id: 'transit-stations-label',
        type: 'symbol',
        source: 'transit-stations',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      })

      // Click handler for station markers
      map.on('click', 'transit-stations-layer', (e: any) => {
        if (e.features && e.features.length > 0) {
          const stationId = e.features[0].properties.id
          onSelectStation(stationId)
        }
      })

      map.on('mouseenter', 'transit-stations-layer', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'transit-stations-layer', () => {
        map.getCanvas().style.cursor = ''
      })
    }
  }

  // Update layers when props change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (map.isStyleLoaded && map.isStyleLoaded()) {
      setupNetworkLayers(map)
    } else if (map.on) {
      map.once('styledata', () => setupNetworkLayers(map))
    }
  }, [network, routeStationIds, originStationId, destinationStationId, selectedStationId])

  // Style change handler
  const handleStyleChange = (styleKey: string) => {
    setCurrentStyle(styleKey)
    if (icgcConfig && mapRef.current) {
      const styleUrl = icgcConfig.Styles?.[styleKey]
      if (styleUrl) {
        mapRef.current.once('styledata', () => {
          setupNetworkLayers(mapRef.current)
        })
        mapRef.current.setStyle(styleUrl)
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Style selector overlay */}
      {icgcConfig?.Styles && (
        <div className="absolute top-3 left-3 md:left-[25rem] z-10 flex flex-wrap gap-1 rounded-lg border border-border bg-card/90 p-1.5 shadow-md backdrop-blur-sm">
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

      <div className="pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-card/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm border border-border/50">
        © Institut Cartogràfic i Geològic de Catalunya (MapICGC GL JS)
      </div>
    </div>
  )
}
