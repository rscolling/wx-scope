import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clampFixSource, clampRadarRefreshSec, defaultSettings, loadSettings, saveSettings } from '../src/settings.ts'

const store = new Map<string, string>()

const memoryStorage: Storage = {
  get length() {
    return store.size
  },
  clear() {
    store.clear()
  },
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null
  },
  key(index: number) {
    return [...store.keys()][index] ?? null
  },
  removeItem(key: string) {
    store.delete(key)
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
}

describe('settings', () => {
  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage,
      configurable: true,
    })
  })

  afterEach(() => {
    store.clear()
  })

  it('starts from the desktop defaults', () => {
    const s = defaultSettings()
    expect(s.rangeMi).toBe(50)
    expect(s.closeMi).toBe(6)
    expect(s.units).toBe('mi')
    expect(s.sweepSec).toBe(2.4)
    expect(s.radarRefreshSec).toBe(15)
    expect(s.fixSource).toBe('ip')
    expect(s.radarEnabled).toBe(true)
    expect(s.lat).toBeNull()
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('round-trips a saved fix and range', () => {
    const next = {
      ...defaultSettings(),
      lat: 35.2,
      lon: -80.8,
      label: 'CLT',
      rangeMi: 25,
      units: 'km' as const,
    }
    saveSettings(next)
    expect(loadSettings()).toEqual(next)
  })

  it('fills missing keys from defaults', () => {
    store.set('wx-scope-settings', JSON.stringify({ rangeMi: 10, label: 'HOME' }))
    const loaded = loadSettings()
    expect(loaded.rangeMi).toBe(10)
    expect(loaded.label).toBe('HOME')
    expect(loaded.closeMi).toBe(6)
    expect(loaded.sweepColor).toBe('dim')
    expect(loaded.radarRefreshSec).toBe(15)
    expect(loaded.fixSource).toBe('ip')
  })

  it('restores a saved GPS fix source', () => {
    store.set('wx-scope-settings', JSON.stringify({ lat: 35.67, lon: -82.7, fixSource: 'gps' }))
    const loaded = loadSettings()
    expect(loaded.fixSource).toBe('gps')
    expect(loaded.lat).toBe(35.67)
  })

  it('treats a missing fix source as IP so GPS can refine it', () => {
    store.set('wx-scope-settings', JSON.stringify({ lat: 35.2, lon: -80.8 }))
    expect(loadSettings().fixSource).toBe('ip')
  })

  it('keeps a valid radar refresh interval', () => {
    store.set('wx-scope-settings', JSON.stringify({ radarRefreshSec: 15 }))
    expect(loadSettings().radarRefreshSec).toBe(15)
  })

  it('clamps an invalid radar refresh interval to 30s', () => {
    store.set('wx-scope-settings', JSON.stringify({ radarRefreshSec: 7 }))
    expect(loadSettings().radarRefreshSec).toBe(30)
  })

  it('returns defaults when stored JSON is invalid', () => {
    store.set('wx-scope-settings', '{not json')
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('accepts 15, 30, and 60 second radar refresh values', () => {
    expect(clampRadarRefreshSec(15)).toBe(15)
    expect(clampRadarRefreshSec(30)).toBe(30)
    expect(clampRadarRefreshSec(60)).toBe(60)
    expect(clampRadarRefreshSec(45)).toBe(30)
    expect(clampRadarRefreshSec('15')).toBe(15)
  })

  it('accepts gps, ip, and manual fix sources', () => {
    expect(clampFixSource('gps')).toBe('gps')
    expect(clampFixSource('manual')).toBe('manual')
    expect(clampFixSource('ip')).toBe('ip')
    expect(clampFixSource('wifi')).toBe('ip')
  })
})
