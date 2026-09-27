import { Accessibility, Footprints } from 'lucide-react'
import type { RouteResult } from '@/core/application/transit-service'
import type { NetworkIndex } from '@/core/domain/network/model'
import type { RoutingGraph } from '@/core/domain/routing/routing-graph'
import { formatDistance, formatMinutes } from './format'
import { LineBadge } from './line-badge'

const FAILURE_COPY: Record<'same-station' | 'unknown-station' | 'no-path', string> = {
  'same-station': 'Origen y destino son la misma estación.',
  'unknown-station': 'Estación desconocida.',
  'no-path': 'No existe ruta que cumpla esta política. Prueba otro criterio.',
}

const ACCESSIBILITY_COPY = {
  'step-free': 'Sin escalones',
  escalator: 'Escaleras mecánicas',
  stairs: 'Solo escaleras',
} as const

export function Itinerary({
  result,
  index,
  graph,
  algorithmLabel,
}: {
  result: RouteResult
  index: NetworkIndex
  graph: RoutingGraph
  algorithmLabel: string
}) {
  if (!result.ok) {
    return (
      <p role="status" className="rounded-md bg-secondary p-3 text-sm leading-relaxed text-muted-foreground">
        {FAILURE_COPY[result.reason]}
      </p>
    )
  }

  const { route, stats } = result
  return (
    <section aria-labelledby="itinerary-heading" className="flex flex-col gap-4">
      <h2 id="itinerary-heading" className="sr-only">
        Itinerario
      </h2>
      <div className="flex items-end justify-between gap-4">
        <p className="text-3xl font-semibold leading-none tracking-tight text-foreground">
          {formatMinutes(route.durationSeconds)}
        </p>
        <dl className="flex gap-4 text-right text-xs">
          <div>
            <dt className="text-muted-foreground">Transbordos</dt>
            <dd className="font-mono font-medium text-foreground">{route.transfers}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Distancia</dt>
            <dd className="font-mono font-medium text-foreground">{formatDistance(route.distanceMeters)}</dd>
          </div>
        </dl>
      </div>

      <ol className="flex flex-col">
        {route.legs.map((leg, i) => {
          const from = index.stations.get(leg.fromStationId)!
          const to = index.stations.get(leg.toStationId)!
          if (leg.kind === 'ride' && leg.lineId) {
            const line = index.lines.get(leg.lineId)!
            const stops = leg.stationIds.length - 1
            const seq = line.platformSequence
            const forward = seq.indexOf(leg.nodeIds[1]) > seq.indexOf(leg.nodeIds[0])
            const terminus = index.platforms.get(forward ? seq[seq.length - 1] : seq[0])!
            return (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <LineBadge line={line} />
                  <span aria-hidden="true" className="w-1 flex-1 rounded-full" style={{ backgroundColor: line.color }} />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 pb-4">
                  <p className="text-sm font-medium leading-6 text-foreground">{from.name}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {`Dirección ${index.stations.get(terminus.stationId)!.name} · ${stops} ${stops === 1 ? 'parada' : 'paradas'} · ${formatMinutes(leg.durationSeconds)}`}
                  </p>
                  {i === route.legs.length - 1 && (
                    <p className="mt-2 text-sm font-medium text-foreground">{to.name}</p>
                  )}
                </div>
              </li>
            )
          }
          const edge = graph.edge(leg.edgeIds[0])
          const fromLine = index.lines.get(graph.node(leg.nodeIds[0]).lineId)!
          const toLine = index.lines.get(graph.node(leg.nodeIds[leg.nodeIds.length - 1]).lineId)!
          return (
            <li key={i} className="flex gap-3">
              <div className="flex w-8 flex-col items-center">
                <Footprints aria-hidden="true" className="size-4 text-muted-foreground" />
                <span aria-hidden="true" className="my-1 w-px flex-1 border-l border-dashed border-muted-foreground" />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 pb-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {`Transbordo ${fromLine.code} → ${toLine.code} · ${formatMinutes(leg.durationSeconds)} · ${formatDistance(leg.distanceMeters)}`}
                </p>
                {edge.accessibility && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Accessibility aria-hidden="true" className="size-3.5" />
                    {ACCESSIBILITY_COPY[edge.accessibility]}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <p suppressHydrationWarning className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        {`${algorithmLabel} · ${stats.expanded} nodos expandidos · ${stats.elapsedMs.toFixed(2)} ms`}
      </p>
    </section>
  )
}
