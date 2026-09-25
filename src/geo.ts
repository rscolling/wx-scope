const EARTH_KM = 6371
const MI_PER_KM = 0.621371
const DIRS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

export function kmToMi(km: number): number {
  return km * MI_PER_KM
}

export function miToKm(mi: number): number {
  return mi / MI_PER_KM
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
}

export function destination(
  lat: number,
  lon: number,
  bearing: number,
  km: number,
): { lat: number; lon: number } {
  const d = km / EARTH_KM
  const brng = (bearing * Math.PI) / 180
  const p1 = (lat * Math.PI) / 180
  const l1 = (lon * Math.PI) / 180
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(brng))
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    )
  return {
    lat: (p2 * 180) / Math.PI,
    lon: (((l2 * 180) / Math.PI + 540) % 360) - 180,
  }
}

export function compass16(deg: number): string {
  return DIRS[Math.round(deg / 22.5) % 16]
}

export function formatBearing(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  return `${d.toFixed(0).padStart(3, '0')}° ${compass16(d)}`
}

export function formatRange(km: number, units: 'mi' | 'km', digits = 1): string {
  const v = units === 'mi' ? kmToMi(km) : km
  const n = v >= 100 ? v.toFixed(0) : v.toFixed(digits)
  return `${n} ${units.toUpperCase()}`
}

export function isConus(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66
}

export function latLonToWorld(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  return { x, y }
}

export function tilesForRadius(
  lat: number,
  lon: number,
  rangeKm: number,
  z: number,
): { x: number; y: number }[] {
  const n = 2 ** z
  const north = destination(lat, lon, 0, rangeKm)
  const south = destination(lat, lon, 180, rangeKm)
  const east = destination(lat, lon, 90, rangeKm)
  const west = destination(lat, lon, 270, rangeKm)
  const a = latLonToWorld(north.lat, west.lon, z)
  const b = latLonToWorld(south.lat, east.lon, z)
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x)))
  const maxX = Math.min(n - 1, Math.floor(Math.max(a.x, b.x)))
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y)))
  const maxY = Math.min(n - 1, Math.floor(Math.max(a.y, b.y)))
  const tiles: { x: number; y: number }[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y })
    }
  }
  return tiles
}

export function pickZoom(
  lat: number,
  rangeKm: number,
  maxZ: number,
  maxTiles: number,
): number {
  for (let z = maxZ; z >= 4; z--) {
    if (tilesForRadius(lat, 0, rangeKm, z).length <= maxTiles) return z
  }
  return 4
}

export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

export function formatClock(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
}

export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s ? `${m}m ${s}s` : `${m}m`
}
