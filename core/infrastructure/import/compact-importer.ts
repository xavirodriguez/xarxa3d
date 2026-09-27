import { haversineMeters } from '../../domain/network/geo'
import type {
  Accessibility,
  Connection,
  Line,
  Platform,
  Station,
  TransportMode,
  TransportNetwork,
} from '../../domain/network/model'
import { DWELL_SECONDS } from '../../domain/simulation/simulation'

export interface CompactStation {
  id: string
  name: string
  lat: number
  lon: number
}

export interface CompactLine {
  id: string
  code: string
  name: string
  mode: TransportMode
  color: string
  depthMeters: number
  depthOverrides?: Record<string, number>
  cruiseSpeedMps: number
  stations: string[]
}

export interface CompactTransfer {
  station: string
  between: [string, string]
  seconds: number
  meters: number
  accessibility: Accessibility
}

export interface CompactNetwork {
  id: string
  name: string
  stations: CompactStation[]
  lines: CompactLine[]
  transfers: CompactTransfer[]
  defaultTransfer: { seconds: number; meters: number; accessibility: Accessibility }
}

const platformId = (stationId: string, lineId: string) => `${stationId}:${lineId}`

/** Import adapter: normalizes a compact source format into the canonical domain model. */
export function importCompactNetwork(raw: CompactNetwork): TransportNetwork {
  const stations: Station[] = raw.stations.map((s) => ({
    id: s.id,
    name: s.name,
    location: { latitude: s.lat, longitude: s.lon },
  }))
  const stationById = new Map(stations.map((s) => [s.id, s]))

  const platforms: Platform[] = []
  const lines: Line[] = []
  const connections: Connection[] = []

  for (const line of raw.lines) {
    const sequence = line.stations.map((sid) => platformId(sid, line.id))
    lines.push({
      id: line.id,
      code: line.code,
      name: line.name,
      mode: line.mode,
      color: line.color,
      platformSequence: sequence,
    })
    line.stations.forEach((sid) =>
      platforms.push({
        id: platformId(sid, line.id),
        stationId: sid,
        lineId: line.id,
        mode: line.mode,
        depthMeters: line.depthOverrides?.[sid] ?? line.depthMeters,
      }),
    )
    for (let i = 0; i < line.stations.length - 1; i++) {
      const a = stationById.get(line.stations[i])
      const b = stationById.get(line.stations[i + 1])
      if (!a || !b) continue
      const meters = haversineMeters(a.location, b.location)
      const seconds = Math.round(meters / line.cruiseSpeedMps + DWELL_SECONDS)
      for (const [from, to] of [
        [a.id, b.id],
        [b.id, a.id],
      ]) {
        connections.push({
          id: `ride:${line.id}:${from}>${to}`,
          kind: 'ride',
          lineId: line.id,
          from: platformId(from, line.id),
          to: platformId(to, line.id),
          durationSeconds: seconds,
          distanceMeters: Math.round(meters),
        })
      }
    }
  }

  const overrides = new Map(
    raw.transfers.map((t) => [`${t.station}|${[...t.between].sort().join('|')}`, t]),
  )
  const linesByStation = new Map<string, string[]>()
  for (const p of platforms) {
    const list = linesByStation.get(p.stationId) ?? []
    list.push(p.lineId)
    linesByStation.set(p.stationId, list)
  }

  for (const [stationId, lineIds] of linesByStation) {
    for (let i = 0; i < lineIds.length; i++) {
      for (let j = i + 1; j < lineIds.length; j++) {
        const pair = [lineIds[i], lineIds[j]].sort()
        const spec = overrides.get(`${stationId}|${pair.join('|')}`) ?? raw.defaultTransfer
        for (const [x, y] of [
          [pair[0], pair[1]],
          [pair[1], pair[0]],
        ]) {
          connections.push({
            id: `transfer:${stationId}:${x}>${y}`,
            kind: 'transfer',
            from: platformId(stationId, x),
            to: platformId(stationId, y),
            durationSeconds: spec.seconds,
            distanceMeters: spec.meters,
            accessibility: spec.accessibility,
          })
        }
      }
    }
  }

  return { id: raw.id, name: raw.name, stations, platforms, lines, connections }
}
