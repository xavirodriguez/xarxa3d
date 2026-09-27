import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NetworkIndex } from '@/core/domain/network/model'
import { formatMinutes } from './format'
import { LineBadge } from './line-badge'

export function StationInspector({
  stationId,
  index,
  onClose,
  onSetOrigin,
  onSetDestination,
}: {
  stationId: string
  index: NetworkIndex
  onClose: () => void
  onSetOrigin: () => void
  onSetDestination: () => void
}) {
  const station = index.stations.get(stationId)
  if (!station) return null
  const platforms = [...(index.platformsByStation.get(stationId) ?? [])].sort(
    (a, b) => b.depthMeters - a.depthMeters,
  )
  const transfers = platforms.flatMap((p) =>
    (index.connectionsByPlatform.get(p.id) ?? []).filter(
      (c) => c.kind === 'transfer' && c.from < c.to,
    ),
  )

  return (
    <section
      aria-labelledby="inspector-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Estación</p>
          <h2 id="inspector-heading" className="text-base font-semibold leading-snug text-balance">
            {station.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar inspector"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {`Plataformas · ${platforms.length}`}
        </p>
        <ul className="flex flex-col gap-1.5">
          {platforms.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <LineBadge line={index.lines.get(p.lineId)!} />
                <span className="capitalize text-muted-foreground">{p.mode}</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {p.depthMeters === 0 ? 'superficie' : `${p.depthMeters > 0 ? '+' : ''}${p.depthMeters} m`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {transfers.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Conexiones internas
          </p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {transfers.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span>{`${index.platforms.get(c.from)!.lineId} ↔ ${index.platforms.get(c.to)!.lineId}`}</span>
                <span className="font-mono">{`${formatMinutes(c.durationSeconds)} · ${c.distanceMeters} m`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onSetOrigin}>
          Salir de aquí
        </Button>
        <Button size="sm" onClick={onSetDestination}>
          Ir aquí
        </Button>
      </div>
    </section>
  )
}
