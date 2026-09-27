import { describe, expect, it } from 'vitest'
import { destination, haversineKm } from '../src/geo.ts'
import { classify, enrich, LightningNet } from '../src/lightning.ts'
import type { RawStrike } from '../src/types.ts'

function strikeAt(lat: number, lon: number, ageMs = 0): RawStrike {
  return {
    id: `t-${lat}-${lon}`,
    lat,
    lon,
    time: Date.now() - ageMs,
    polarity: 1,
  }
}

describe('classify', () => {
  const closeMi = 6
  const rangeMi = 50

  it('marks sub-mile strikes as overhead', () => {
    expect(classify(0.5, closeMi, rangeMi)).toBe('overhead')
  })

  it('marks strikes inside the close threshold as close', () => {
    expect(classify(5, closeMi, rangeMi)).toBe('close')
  })

  it('marks 6–10 mi strikes as near', () => {
    expect(classify(12, closeMi, rangeMi)).toBe('near')
  })

  it('marks farther in-range strikes as area', () => {
    expect(classify(30, closeMi, rangeMi)).toBe('area')
  })

  it('drops strikes beyond the scope range', () => {
    expect(classify(100, closeMi, rangeMi)).toBeNull()
  })
})

describe('enrich', () => {
  const origin = { lat: 35, lon: -80 }

  it('attaches range, east bearing, and close class for a nearby eastern strike', () => {
    const pos = destination(origin.lat, origin.lon, 90, 5)
    const hit = enrich(strikeAt(pos.lat, pos.lon), origin.lat, origin.lon, 6, 50)
    expect(hit).not.toBeNull()
    expect(hit!.classification).toBe('close')
    expect(hit!.rangeKm).toBeCloseTo(5, 1)
    expect(hit!.bearingDeg).toBeCloseTo(90, 0)
  })

  it('returns null when the strike is outside range', () => {
    const pos = destination(origin.lat, origin.lon, 0, 200)
    expect(enrich(strikeAt(pos.lat, pos.lon), origin.lat, origin.lon, 6, 50)).toBeNull()
  })
})

describe('LightningNet.inRange', () => {
  it('keeps fresh in-range strikes and sorts nearest first', () => {
    const origin = { lat: 35, lon: -80 }
    const near = destination(origin.lat, origin.lon, 45, 8)
    const far = destination(origin.lat, origin.lon, 180, 40)
    const outside = destination(origin.lat, origin.lon, 270, 200)
    const net = new LightningNet()
    net.strikes = [
      strikeAt(far.lat, far.lon),
      strikeAt(near.lat, near.lon),
      strikeAt(outside.lat, outside.lon),
      strikeAt(near.lat, near.lon, 60 * 60_000),
    ]
    const hits = net.inRange(origin.lat, origin.lon, 6, 50, 20 * 60_000)
    expect(hits).toHaveLength(2)
    expect(hits[0].rangeKm).toBeLessThan(hits[1].rangeKm)
    expect(hits[0].rangeKm).toBeCloseTo(haversineKm(origin.lat, origin.lon, near.lat, near.lon), 5)
  })
})
