export function formatMinutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

const SERVICE_START_SECONDS = 6 * 3600

export function formatClock(simSeconds: number): string {
  const total = Math.floor(SERVICE_START_SECONDS + simSeconds) % 86_400
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
