import { describe, expect, it } from 'vitest'
import { parseLcrefValid, parseWmsTimeExtent } from '../src/radar.ts'

describe('parseLcrefValid', () => {
  it('reads the MRMS SeamlessHSR valid time', () => {
    const t = parseLcrefValid({
      meta: { start_valid: '2026-09-27T17:44:00Z', product: 'lcref' },
    })
    expect(t).toBe(Date.parse('2026-09-27T17:44:00Z'))
  })

  it('returns null for missing or junk payloads', () => {
    expect(parseLcrefValid(null)).toBeNull()
    expect(parseLcrefValid({})).toBeNull()
    expect(parseLcrefValid({ meta: { start_valid: 'nope' } })).toBeNull()
  })
})

describe('parseWmsTimeExtent', () => {
  it('reads the NOAA MRMS time list and default', () => {
    const xml = `
      <Extent name="time" default="2026-09-27T20:42:09Z" nearestValue="1">2026-09-27T20:40:21.000Z,2026-09-27T20:42:09.000Z</Extent>
    `
    const parsed = parseWmsTimeExtent(xml)
    expect(parsed.defaultTime).toBe('2026-09-27T20:42:09Z')
    expect(parsed.times).toEqual(['2026-09-27T20:40:21.000Z', '2026-09-27T20:42:09.000Z'])
  })

  it('returns empty times when the extent is missing', () => {
    expect(parseWmsTimeExtent('<Layer></Layer>')).toEqual({ defaultTime: null, times: [] })
  })
})
