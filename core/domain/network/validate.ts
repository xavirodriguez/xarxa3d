import { isValidCoordinate } from './geo'
import type { TransportNetwork } from './model'

export type ValidationCode =
  | 'duplicate-id'
  | 'unknown-station'
  | 'unknown-line'
  | 'unknown-platform'
  | 'line-mismatch'
  | 'transfer-across-stations'
  | 'invalid-duration'
  | 'invalid-coordinate'
  | 'orphan-platform'

export interface ValidationIssue {
  readonly code: ValidationCode
  readonly message: string
  readonly ref: string
}

export interface ValidationResult {
  readonly valid: boolean
  readonly issues: readonly ValidationIssue[]
}

export function validateNetwork(network: TransportNetwork): ValidationResult {
  const issues: ValidationIssue[] = []
  const push = (code: ValidationCode, ref: string, message: string) =>
    issues.push({ code, ref, message })

  const seen = new Set<string>()
  const checkUnique = (kind: string, id: string) => {
    const key = `${kind}:${id}`
    if (seen.has(key)) push('duplicate-id', id, `${kind} duplicado: ${id}`)
    seen.add(key)
  }

  const stations = new Map(network.stations.map((s) => [s.id, s]))
  const lines = new Map(network.lines.map((l) => [l.id, l]))
  const platforms = new Map(network.platforms.map((p) => [p.id, p]))

  for (const station of network.stations) {
    checkUnique('station', station.id)
    if (!isValidCoordinate(station.location)) {
      push('invalid-coordinate', station.id, `Coordenada inválida en ${station.name}`)
    }
  }

  for (const platform of network.platforms) {
    checkUnique('platform', platform.id)
    if (!stations.has(platform.stationId)) {
      push('unknown-station', platform.id, `La plataforma ${platform.id} no pertenece a ninguna estación`)
    }
    if (!lines.has(platform.lineId)) {
      push('unknown-line', platform.id, `La plataforma ${platform.id} referencia una línea inexistente`)
    }
  }

  for (const line of network.lines) {
    checkUnique('line', line.id)
    for (const pid of line.platformSequence) {
      const platform = platforms.get(pid)
      if (!platform) push('unknown-platform', line.id, `La línea ${line.code} referencia ${pid}`)
      else if (platform.lineId !== line.id) {
        push('line-mismatch', line.id, `${pid} está en la secuencia de ${line.code} pero pertenece a otra línea`)
      }
    }
  }

  const connected = new Set<string>()
  for (const c of network.connections) {
    checkUnique('connection', c.id)
    const from = platforms.get(c.from)
    const to = platforms.get(c.to)
    if (!from || !to) {
      push('unknown-platform', c.id, `La conexión ${c.id} tiene extremos inexistentes`)
      continue
    }
    connected.add(c.from)
    connected.add(c.to)

    if (!(c.durationSeconds > 0)) {
      push('invalid-duration', c.id, `La conexión ${c.id} tiene duración no positiva`)
    }
    if (c.kind === 'ride' && (from.lineId !== c.lineId || to.lineId !== c.lineId)) {
      push('line-mismatch', c.id, `El trayecto ${c.id} une plataformas de otra línea`)
    }
    if (c.kind === 'transfer' && from.stationId !== to.stationId) {
      push('transfer-across-stations', c.id, `El transbordo ${c.id} cruza estaciones; debería ser "walk"`)
    }
  }

  for (const platform of network.platforms) {
    if (!connected.has(platform.id)) {
      push('orphan-platform', platform.id, `La plataforma ${platform.id} no tiene conexiones`)
    }
  }

  return { valid: issues.length === 0, issues }
}
