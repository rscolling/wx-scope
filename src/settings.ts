import type { GeoFix, Settings } from './types.ts'

const KEY = 'wx-scope-settings'
const REFRESH_SECS = new Set([15, 30, 60])

export function clampRadarRefreshSec(n: unknown): number {
  const v = Number(n)
  return REFRESH_SECS.has(v) ? v : 30
}

export function clampFixSource(n: unknown): GeoFix['source'] {
  if (n === 'gps' || n === 'ip' || n === 'manual') return n
  return 'ip'
}

/** IP city estimates and unnamed saves should yield to GPS on launch. */
export function shouldAutolocate(source: GeoFix['source'], label: string): boolean {
  if (source === 'ip' || source === 'gps') return true
  const n = label.trim().toUpperCase()
  if (!n || n === 'GPS' || n === 'IP' || n === 'SAVED' || n === 'MANUAL') return true
  if (n.includes(',')) return true
  return false
}

export function defaultSettings(): Settings {
  return {
    lat: null,
    lon: null,
    label: '',
    fixSource: 'ip',
    rangeMi: 50,
    units: 'mi',
    radarSource: 'auto',
    radarRefreshSec: 15,
    radarEnabled: true,
    mapEnabled: true,
    lightningEnabled: true,
    closeMi: 6,
    audio: true,
    sweepSec: 2.4,
    sweepColor: 'dim',
    sweepBright: 'low',
    sweepTrail: 'short',
  }
}

export function loadSettings(): Settings {
  const base = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Settings>
    const merged = { ...base, ...parsed }
    merged.radarRefreshSec = clampRadarRefreshSec(merged.radarRefreshSec)
    merged.fixSource = clampFixSource(merged.fixSource)
    return merged
  } catch {
    return base
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
