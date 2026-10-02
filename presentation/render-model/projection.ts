import type { GeoCoordinate } from '@/core/domain/network/model'

export type WorldCoordinate = readonly [x: number, y: number, z: number]

export interface ProjectionOptions {
  readonly origin: GeoCoordinate
  readonly verticalExaggeration: number
}

export interface Projection {
  project(geo: GeoCoordinate, depthMeters: number): WorldCoordinate
}

/** Converts (lng, lat) to normalized Web Mercator coordinates [0..1, 0..1] and scale factor. */
export function lngLatToMercator(lng: number, lat: number) {
  const d = Math.PI / 180
  const max = 85.0511287798
  const clampedLat = Math.max(-max, Math.min(max, lat))
  const sin = Math.sin(clampedLat * d)
  const x = (lng + 180) / 360
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  const R = 6378137
  const meterInMercator = 1 / (2 * Math.PI * R * Math.cos(clampedLat * d))
  return { x, y, meterInMercator }
}

/** Exact Web Mercator (EPSG:3857) projection: lat/lon → X (east meters), Z (south meters), Y (up meters). */
export function createWebMercatorProjection({
  origin,
  verticalExaggeration = 2,
}: ProjectionOptions): Projection {
  const originMerc = lngLatToMercator(origin.longitude, origin.latitude)
  const scale = originMerc.meterInMercator

  return {
    project(geo, depthMeters) {
      const pointMerc = lngLatToMercator(geo.longitude, geo.latitude)
      const eastMeters = (pointMerc.x - originMerc.x) / scale
      const southMeters = (pointMerc.y - originMerc.y) / scale
      const upMeters = depthMeters * verticalExaggeration
      return [eastMeters, upMeters, southMeters]
    },
  }
}

/** Legacy/fallback alias for backward compatibility */
export function createLocalProjection(options: {
  origin: GeoCoordinate
  metersPerUnit?: number
  verticalExaggeration: number
}): Projection {
  return createWebMercatorProjection({
    origin: options.origin,
    verticalExaggeration: options.verticalExaggeration,
  })
}
