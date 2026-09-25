import type { Settings } from './types.ts'

const KEY = 'wx-scope-settings'

export function defaultSettings(): Settings {
  return {
    lat: null,
    lon: null,
    label: '',
    rangeMi: 50,
    units: 'mi',
    radarSource: 'auto',
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
    return { ...base, ...parsed }
  } catch {
    return base
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
