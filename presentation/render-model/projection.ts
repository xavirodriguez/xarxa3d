import type { GeoCoordinate } from '@/core/domain/network/model'

export type WorldCoordinate = readonly [x: number, y: number, z: number]

export interface ProjectionOptions {
  readonly origin: GeoCoordinate
  readonly metersPerUnit: number
  readonly verticalExaggeration: number
}

export interface Projection {
  project(geo: GeoCoordinate, depthMeters: number): WorldCoordinate
}

/** Local equirectangular projection: lat/lon → X (east) / Z (south), depth → Y. */
export function createLocalProjection({
  origin,
  metersPerUnit,
  verticalExaggeration,
}: ProjectionOptions): Projection {
  const metersPerDegLat = 111_320
  const metersPerDegLon = 111_320 * Math.cos((origin.latitude * Math.PI) / 180)
  return {
    project(geo, depthMeters) {
      const east = (geo.longitude - origin.longitude) * metersPerDegLon
      const north = (geo.latitude - origin.latitude) * metersPerDegLat
      return [
        east / metersPerUnit,
        (depthMeters * verticalExaggeration) / metersPerUnit,
        -north / metersPerUnit,
      ]
    },
  }
}
