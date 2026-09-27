'use client'

import { ArrowDownUp, ChevronDown } from 'lucide-react'
import type { Station } from '@/core/domain/network/model'
import type { CostPolicyId } from '@/core/domain/routing/cost-policy'
import type { PathFinderId } from '@/core/domain/routing/path-finder'
import { cn } from '@/lib/utils'

const POLICIES: { id: CostPolicyId; label: string }[] = [
  { id: 'fastest', label: 'Más rápida' },
  { id: 'fewest-transfers', label: 'Menos transbordos' },
  { id: 'accessible', label: 'Accesible' },
  { id: 'shortest', label: 'Más corta' },
]

const ALGORITHMS: { id: PathFinderId; label: string }[] = [
  { id: 'astar', label: 'A*' },
  { id: 'dijkstra', label: 'Dijkstra' },
]

function StationSelect({
  id,
  label,
  value,
  stations,
  onChange,
  marker,
}: {
  id: string
  label: string
  value: string
  stations: readonly Station[]
  onChange: (id: string) => void
  marker: 'origin' | 'destination'
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0 rounded-full',
          marker === 'origin' ? 'border-2 border-foreground bg-card' : 'bg-primary',
        )}
      />
      <div className="relative flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns,
}: {
  name: string
  legend: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  columns: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {legend}
      </legend>
      <div className={cn('grid gap-1 rounded-md bg-secondary p-1', columns)}>
        {options.map((o) => (
          <label
            key={o.id}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-sm px-2 py-1.5 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              value === o.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function RoutePlanner({
  stations,
  origin,
  destination,
  policy,
  algorithm,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onPolicyChange,
  onAlgorithmChange,
}: {
  stations: readonly Station[]
  origin: string
  destination: string
  policy: CostPolicyId
  algorithm: PathFinderId
  onOriginChange: (id: string) => void
  onDestinationChange: (id: string) => void
  onSwap: () => void
  onPolicyChange: (id: CostPolicyId) => void
  onAlgorithmChange: (id: PathFinderId) => void
}) {
  return (
    <section aria-labelledby="planner-heading" className="flex flex-col gap-5">
      <h2 id="planner-heading" className="sr-only">
        Planificador de ruta
      </h2>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <StationSelect id="origin" label="Origen" value={origin} stations={stations} onChange={onOriginChange} marker="origin" />
          <StationSelect id="destination" label="Destino" value={destination} stations={stations} onChange={onDestinationChange} marker="destination" />
        </div>
        <button
          type="button"
          onClick={onSwap}
          aria-label="Intercambiar origen y destino"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDownUp className="size-4" />
        </button>
      </div>

      <Segmented name="policy" legend="Política de coste" options={POLICIES} value={policy} onChange={onPolicyChange} columns="grid-cols-2" />
      <Segmented name="algorithm" legend="Algoritmo" options={ALGORITHMS} value={algorithm} onChange={onAlgorithmChange} columns="grid-cols-2" />
    </section>
  )
}
