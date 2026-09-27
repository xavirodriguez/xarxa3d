import type { TransitService } from '@/core/application/transit-service'
import { LineBadge } from './line-badge'

export function NetworkStatus({ service }: { service: TransitService }) {
  const { network, validation, graph } = service
  const figures = [
    { label: 'Estaciones', value: network.stations.length },
    { label: 'Nodos', value: graph.order },
    { label: 'Aristas', value: graph.size },
  ]

  return (
    <section aria-labelledby="network-heading" className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="network-heading" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Red compilada
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span aria-hidden="true" className={validation.valid ? 'size-2 rounded-full bg-foreground' : 'size-2 rounded-full bg-primary'} />
          {validation.valid ? 'Invariantes OK' : `${validation.issues.length} incidencias`}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.label} className="rounded-md bg-secondary px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
            <dd className="font-mono text-sm font-medium text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>
      <ul aria-label="Líneas" className="flex flex-wrap gap-1.5">
        {network.lines.map((l) => (
          <li key={l.id} title={l.name}>
            <LineBadge line={l} />
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground pt-1">
        Mapa y relieve: © Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)
      </p>
    </section>
  )
}
