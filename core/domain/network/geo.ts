import type { GeoCoordinate } from './model'

const EARTH_RADIUS_METERS = 6_371_008.8

/** Upper bound on travel speed in the network; keeps A* heuristics admissible. */
export const MAX_NETWORK_SPEED_MPS = 10

export function haversineMeters(a: GeoCoordinate, b: GeoCoordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function isValidCoordinate(c: GeoCoordinate): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  )
}
