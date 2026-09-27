import { tick, type SimulationModel, type SimulationState } from '@/core/domain/simulation/simulation'

const FIXED_STEP_SECONDS = 0.5
const NOTIFY_INTERVAL_MS = 250

export interface SimulationSnapshot {
  readonly timeSeconds: number
  readonly running: boolean
  readonly speed: number
  readonly vehicles: number
}

/**
 * Bridges frame-rate-dependent rendering to the fixed-step deterministic simulation.
 * State lives outside React; subscribers get throttled snapshots for UI only.
 */
export class SimulationController {
  state: SimulationState
  private accumulator = 0
  private running = true
  private speed = 30
  private listeners = new Set<() => void>()
  private lastNotify = 0
  private snapshot: SimulationSnapshot

  constructor(readonly model: SimulationModel) {
    this.state = model.initialState
    this.snapshot = this.buildSnapshot()
  }

  advance(realDeltaSeconds: number): void {
    if (!this.running) return
    this.accumulator += Math.min(realDeltaSeconds, 0.1) * this.speed
    while (this.accumulator >= FIXED_STEP_SECONDS) {
      this.state = tick(this.state, this.model.topology, FIXED_STEP_SECONDS)
      this.accumulator -= FIXED_STEP_SECONDS
    }
    const now = performance.now()
    if (now - this.lastNotify > NOTIFY_INTERVAL_MS) {
      this.lastNotify = now
      this.emit()
    }
  }

  setRunning(running: boolean) {
    this.running = running
    this.emit()
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.emit()
  }

  reset() {
    this.state = this.model.initialState
    this.accumulator = 0
    this.emit()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  private buildSnapshot(): SimulationSnapshot {
    return {
      timeSeconds: this.state.timeSeconds,
      running: this.running,
      speed: this.speed,
      vehicles: this.state.vehicles.length,
    }
  }

  private emit() {
    this.snapshot = this.buildSnapshot()
    for (const l of this.listeners) l()
  }
}
