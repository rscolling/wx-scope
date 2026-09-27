import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWet, PrecipFeed, wmoLabel } from '../src/precip.ts'

describe('wmoLabel', () => {
  it('names known codes and falls back for unknown ones', () => {
    expect(wmoLabel(0)).toBe('CLEAR')
    expect(wmoLabel(61)).toBe('LIGHT RAIN')
    expect(wmoLabel(95)).toBe('THUNDERSTORM')
    expect(wmoLabel(123)).toBe('WMO 123')
  })
})

describe('isWet', () => {
  it('treats measurable last-hour precip as wet even when the sky is clear', () => {
    expect(isWet(0, 0.005)).toBe(true)
    expect(isWet(0, 0.004)).toBe(false)
  })

  it('treats rain and drizzle codes as wet', () => {
    expect(isWet(51, 0)).toBe(true)
    expect(isWet(61, 0)).toBe(true)
    expect(isWet(95, 0)).toBe(true)
  })

  it('treats clear, overcast, and fog as dry without precip', () => {
    expect(isWet(0, 0)).toBe(false)
    expect(isWet(3, 0)).toBe(false)
    expect(isWet(45, 0)).toBe(false)
    expect(isWet(48, 0)).toBe(false)
  })
})

describe('PrecipFeed.refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('maps an Open-Meteo current block into a wet LIGHT RAIN reading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          current: { precipitation: 0.12, weather_code: 61, cloud_cover: 90 },
        }),
      })),
    )
    const feed = new PrecipFeed()
    await feed.refresh(35, -80, 'mi')
    expect(feed.status).toBe('live')
    expect(feed.current?.label).toBe('LIGHT RAIN')
    expect(feed.current?.wet).toBe(true)
    expect(feed.current?.lastHourIn).toBeCloseTo(0.12, 5)
    expect(feed.current?.detail).toContain('0.12 IN')
    expect(feed.current?.detail).toContain('90% CLOUD')
  })

  it('reports millimeters when units are km', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          current: { precipitation: 0.12, weather_code: 61 },
        }),
      })),
    )
    const feed = new PrecipFeed()
    await feed.refresh(35, -80, 'km')
    expect(feed.current?.detail).toContain('3.0 MM')
  })

  it('sets error status when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    )
    const feed = new PrecipFeed()
    await feed.refresh(35, -80, 'mi')
    expect(feed.status).toBe('error')
    expect(feed.lastError).toBe('precip 500')
    expect(feed.current).toBeNull()
  })
})
