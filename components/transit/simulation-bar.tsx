'use client'

import { Pause, Play, RotateCcw } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { SimulationController } from '@/presentation/simulation/simulation-controller'
import { cn } from '@/lib/utils'
import { formatClock } from './format'

const SPEEDS = [1, 30, 120]

export function SimulationBar({ controller }: { controller: SimulationController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)

  return (
    <section
      aria-label="Controles de simulación"
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-2 py-1.5 text-card-foreground shadow-lg"
    >
      <button
        type="button"
        onClick={() => controller.setRunning(!snapshot.running)}
        aria-label={snapshot.running ? 'Pausar simulación' : 'Reanudar simulación'}
        className="flex size-8 items-center justify-center rounded-md bg-foreground text-card transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {snapshot.running ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium tabular-nums leading-tight" aria-live="off">
          {formatClock(snapshot.timeSeconds)}
        </span>
        <span className="text-[11px] leading-tight text-muted-foreground">
          {`${snapshot.vehicles} vehículos`}
        </span>
      </div>

      <div role="group" aria-label="Velocidad" className="flex gap-0.5 rounded-md bg-secondary p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={snapshot.speed === s}
            onClick={() => controller.setSpeed(s)}
            className={cn(
              'rounded-sm px-2 py-1 font-mono text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              snapshot.speed === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {`${s}×`}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => controller.reset()}
        aria-label="Reiniciar simulación"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCcw className="size-4" />
      </button>
    </section>
  )
}
