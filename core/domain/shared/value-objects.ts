export type Brand<T, B extends string> = T & { readonly __brand: B }

export type StationId = Brand<string, 'StationId'>
export type PlatformId = Brand<string, 'PlatformId'>
export type LineId = Brand<string, 'LineId'>
export type ServiceId = Brand<string, 'ServiceId'>
export type ConnectionId = Brand<string, 'ConnectionId'>
export type NetworkId = Brand<string, 'NetworkId'>
export type NetworkVersion = Brand<string, 'NetworkVersion'>
export type RouteId = Brand<string, 'RouteId'>
export type VehicleId = Brand<string, 'VehicleId'>

export interface Duration {
  readonly seconds: number
}

export interface Distance {
  readonly meters: number
}

export interface Color {
  readonly hex: string
}

export function duration(seconds: number): Duration {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Duration must be finite and non-negative')
  return Object.freeze({ seconds })
}

export function distance(meters: number): Distance {
  if (!Number.isFinite(meters) || meters < 0) throw new Error('Distance must be finite and non-negative')
  return Object.freeze({ meters })
}

export function color(hex: string): Color {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid color: ${hex}`)
  return Object.freeze({ hex: hex.toLowerCase() })
}

export function asStationId(value: string): StationId { return value as StationId }
export function asPlatformId(value: string): PlatformId { return value as PlatformId }
export function asLineId(value: string): LineId { return value as LineId }
export function asServiceId(value: string): ServiceId { return value as ServiceId }
export function asConnectionId(value: string): ConnectionId { return value as ConnectionId }
export function asNetworkId(value: string): NetworkId { return value as NetworkId }
export function asNetworkVersion(value: string): NetworkVersion { return value as NetworkVersion }
export function asRouteId(value: string): RouteId { return value as RouteId }
export function asVehicleId(value: string): VehicleId { return value as VehicleId }

export interface AccessibilityProfile {
  readonly wheelchair: boolean
  readonly stairs: boolean
  readonly elevator: boolean
  readonly escalator: boolean
}

export const fullyAccessible: AccessibilityProfile = Object.freeze({
  wheelchair: true,
  stairs: false,
  elevator: true,
  escalator: true,
})

export const unknownAccessibility: AccessibilityProfile = Object.freeze({
  wheelchair: false,
  stairs: true,
  elevator: false,
  escalator: false,
})

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export type DomainErrorCode = 'invalid-value' | 'duplicate-id' | 'missing-reference' | 'incompatible-reference'

export interface DomainError {
  readonly code: DomainErrorCode
  readonly message: string
  readonly ref?: string
}

export function domainError(code: DomainErrorCode, message: string, ref?: string): DomainError {
  return Object.freeze({ code, message, ref })
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}

export function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`)
}

export function assertProgress(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Progress must be between 0 and 1')
}
