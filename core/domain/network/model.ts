export type StationId = string
export type PlatformId = string
export type LineId = string
export type ConnectionId = string

export type TransportMode = 'metro' | 'bus' | 'funicular' | 'tram'

export interface GeoCoordinate {
  readonly latitude: number
  readonly longitude: number
}

export interface Station {
  readonly id: StationId
  readonly name: string
  readonly location: GeoCoordinate
}

export interface Platform {
  readonly id: PlatformId
  readonly stationId: StationId
  readonly lineId: LineId
  readonly mode: TransportMode
  /** Negative values are below street level. */
  readonly depthMeters: number
}

export interface Line {
  readonly id: LineId
  readonly code: string
  readonly name: string
  readonly mode: TransportMode
  readonly color: string
  readonly platformSequence: readonly PlatformId[]
}

export type Accessibility = 'step-free' | 'escalator' | 'stairs'

export type ConnectionKind = 'ride' | 'transfer' | 'walk'

interface ConnectionBase {
  readonly id: ConnectionId
  readonly from: PlatformId
  readonly to: PlatformId
  readonly durationSeconds: number
  readonly distanceMeters: number
}

export interface RideConnection extends ConnectionBase {
  readonly kind: 'ride'
  readonly lineId: LineId
}

export interface TransferConnection extends ConnectionBase {
  readonly kind: 'transfer'
  readonly accessibility: Accessibility
}

export interface WalkConnection extends ConnectionBase {
  readonly kind: 'walk'
  readonly accessibility: Accessibility
}

export type Connection = RideConnection | TransferConnection | WalkConnection

export interface TransportNetwork {
  readonly id: string
  readonly name: string
  readonly stations: readonly Station[]
  readonly platforms: readonly Platform[]
  readonly lines: readonly Line[]
  readonly connections: readonly Connection[]
}

export interface NetworkIndex {
  readonly stations: ReadonlyMap<StationId, Station>
  readonly platforms: ReadonlyMap<PlatformId, Platform>
  readonly lines: ReadonlyMap<LineId, Line>
  readonly platformsByStation: ReadonlyMap<StationId, readonly Platform[]>
  readonly connectionsByPlatform: ReadonlyMap<PlatformId, readonly Connection[]>
}

export function indexNetwork(network: TransportNetwork): NetworkIndex {
  const platformsByStation = new Map<StationId, Platform[]>()
  for (const platform of network.platforms) {
    const list = platformsByStation.get(platform.stationId) ?? []
    list.push(platform)
    platformsByStation.set(platform.stationId, list)
  }

  const connectionsByPlatform = new Map<PlatformId, Connection[]>()
  for (const connection of network.connections) {
    const list = connectionsByPlatform.get(connection.from) ?? []
    list.push(connection)
    connectionsByPlatform.set(connection.from, list)
  }

  return {
    stations: new Map(network.stations.map((s) => [s.id, s])),
    platforms: new Map(network.platforms.map((p) => [p.id, p])),
    lines: new Map(network.lines.map((l) => [l.id, l])),
    platformsByStation,
    connectionsByPlatform,
  }
}

export function stationModes(index: NetworkIndex, stationId: StationId): TransportMode[] {
  const platforms = index.platformsByStation.get(stationId) ?? []
  return [...new Set(platforms.map((p) => p.mode))]
}

export function isInterchange(index: NetworkIndex, stationId: StationId): boolean {
  const platforms = index.platformsByStation.get(stationId) ?? []
  return new Set(platforms.map((p) => p.lineId)).size > 1
}
