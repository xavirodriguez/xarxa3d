import type { LineId, PlatformId, TransportNetwork } from '../network/model'

export const DWELL_SECONDS = 20

export interface LineTopology {
  readonly lineId: LineId
  readonly platforms: readonly PlatformId[]
  /** Motion time between consecutive platforms in the sequence. */
  readonly segmentSeconds: readonly number[]
}

export interface VehicleState {
  readonly vehicleId: string
  readonly lineId: LineId
  readonly segmentIndex: number
  readonly direction: 1 | -1
  readonly progress: number
  readonly dwellRemaining: number
}

export interface SimulationState {
  readonly timeSeconds: number
  readonly vehicles: readonly VehicleState[]
}

export interface SimulationModel {
  readonly topology: ReadonlyMap<LineId, LineTopology>
  readonly initialState: SimulationState
}

export function createSimulationModel(
  network: TransportNetwork,
  vehiclesPerLine = 4,
): SimulationModel {
  const rideDuration = new Map<string, number>()
  for (const c of network.connections) {
    if (c.kind === 'ride') rideDuration.set(`${c.from}>${c.to}`, c.durationSeconds)
  }

  const topology = new Map<LineId, LineTopology>()
  const vehicles: VehicleState[] = []

  for (const line of network.lines) {
    const seq = line.platformSequence
    if (seq.length < 2) continue
    const segmentSeconds = seq.slice(0, -1).map((from, i) => {
      const total = rideDuration.get(`${from}>${seq[i + 1]}`) ?? 60
      return Math.max(10, total - DWELL_SECONDS)
    })
    topology.set(line.id, { lineId: line.id, platforms: seq, segmentSeconds })

    const segments = segmentSeconds.length
    const count = Math.min(vehiclesPerLine, segments * 2)
    for (let v = 0; v < count; v++) {
      const slot = Math.floor((v * segments * 2) / count)
      const forward = slot < segments
      vehicles.push({
        vehicleId: `${line.id}#${v + 1}`,
        lineId: line.id,
        segmentIndex: forward ? slot : slot - segments,
        direction: forward ? 1 : -1,
        progress: 0,
        dwellRemaining: DWELL_SECONDS * ((v % 3) / 3),
      })
    }
  }

  return { topology, initialState: { timeSeconds: 0, vehicles } }
}

function advanceVehicle(vehicle: VehicleState, line: LineTopology, dt: number): VehicleState {
  let { segmentIndex, direction, progress, dwellRemaining } = vehicle
  let remaining = dt
  const last = line.segmentSeconds.length - 1

  while (remaining > 0) {
    if (dwellRemaining > 0) {
      const used = Math.min(dwellRemaining, remaining)
      dwellRemaining -= used
      remaining -= used
      continue
    }
    const duration = line.segmentSeconds[segmentIndex]
    const timeLeft = (1 - progress) * duration
    if (remaining < timeLeft) {
      progress += remaining / duration
      remaining = 0
    } else {
      remaining -= timeLeft
      progress = 0
      dwellRemaining = DWELL_SECONDS
      if (direction === 1) {
        if (segmentIndex === last) direction = -1
        else segmentIndex++
      } else if (segmentIndex === 0) direction = 1
      else segmentIndex--
    }
  }

  return { ...vehicle, segmentIndex, direction, progress, dwellRemaining }
}

/** Pure, deterministic step: state(t + dt) = tick(state(t), dt). */
export function tick(
  state: SimulationState,
  topology: ReadonlyMap<LineId, LineTopology>,
  dt: number,
): SimulationState {
  return {
    timeSeconds: state.timeSeconds + dt,
    vehicles: state.vehicles.map((v) => advanceVehicle(v, topology.get(v.lineId)!, dt)),
  }
}

/** Resolves a vehicle to the two platforms it is between and its interpolation factor. */
export function vehicleSpan(
  vehicle: VehicleState,
  line: LineTopology,
): { from: PlatformId; to: PlatformId; t: number } {
  const a = line.platforms[vehicle.segmentIndex]
  const b = line.platforms[vehicle.segmentIndex + 1]
  return vehicle.direction === 1
    ? { from: a, to: b, t: vehicle.progress }
    : { from: b, to: a, t: vehicle.progress }
}
