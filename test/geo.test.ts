import { describe, expect, it } from 'vitest'
import {
  bearingDeg,
  compass16,
  destination,
  formatAge,
  formatBearing,
  formatClock,
  formatRange,
  haversineKm,
  isConus,
  kmToMi,
  latLonToWorld,
  miToKm,
  pickZoom,
  tileBBox3857,
  tilesForRadius,
  WEB_MERCATOR_ORIGIN,
} from '../src/geo.ts'

describe('range conversion', () => {
  it('round-trips miles and kilometers', () => {
    expect(kmToMi(miToKm(50))).toBeCloseTo(50, 10)
    expect(miToKm(1)).toBeCloseTo(1.609344, 5)
  })
})

describe('great-circle', () => {
  it('reports zero distance to the same point', () => {
    expect(haversineKm(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 10)
  })

  it('moves 100 km north and measures that range and bearing', () => {
    const origin = { lat: 40, lon: -75 }
    const north = destination(origin.lat, origin.lon, 0, 100)
    expect(haversineKm(origin.lat, origin.lon, north.lat, north.lon)).toBeCloseTo(100, 1)
    expect(bearingDeg(origin.lat, origin.lon, north.lat, north.lon)).toBeCloseTo(0, 0)
    expect(north.lat).toBeGreaterThan(origin.lat)
  })

  it('places a due-east destination at bearing 90', () => {
    const east = destination(35, -80, 90, 20)
    expect(east.lon).toBeGreaterThan(-80)
    expect(bearingDeg(35, -80, east.lat, east.lon)).toBeCloseTo(90, 0)
  })
})

describe('labels', () => {
  it('formats bearings on the 16-wind compass', () => {
    expect(formatBearing(0)).toBe('000° N')
    expect(formatBearing(90)).toBe('090° E')
    expect(formatBearing(-45)).toBe('315° NW')
    expect(compass16(45)).toBe('NE')
    expect(compass16(360)).toBe('N')
  })

  it('formats range in the selected units', () => {
    expect(formatRange(miToKm(10), 'mi', 0)).toBe('10 MI')
    expect(formatRange(12.34, 'km', 1)).toBe('12.3 KM')
    expect(formatRange(150, 'km', 1)).toBe('150 KM')
  })

  it('formats age and UTC clock', () => {
    expect(formatAge(500)).toBe('500ms')
    expect(formatAge(5_000)).toBe('5s')
    expect(formatAge(65_000)).toBe('1m 5s')
    expect(formatAge(-1)).toBe('—')
    expect(formatClock(new Date(Date.UTC(2026, 0, 1, 8, 9, 10)))).toBe('08:09:10Z')
  })
})

describe('map tiles', () => {
  it('treats the CONUS box as in-coverage', () => {
    expect(isConus(39.1, -98.4)).toBe(true)
    expect(isConus(51.5, -0.12)).toBe(false)
    expect(isConus(21.3, -157.8)).toBe(false)
  })

  it('puts the equator and prime meridian at the world origin', () => {
    const w = latLonToWorld(0, 0, 0)
    expect(w.x).toBeCloseTo(0.5, 6)
    expect(w.y).toBeCloseTo(0.5, 6)
  })

  it('maps zoom-0 tile 0/0 to the full Web Mercator world', () => {
    const [minX, minY, maxX, maxY] = tileBBox3857(0, 0, 0)
    expect(minX).toBeCloseTo(-WEB_MERCATOR_ORIGIN, 6)
    expect(minY).toBeCloseTo(-WEB_MERCATOR_ORIGIN, 6)
    expect(maxX).toBeCloseTo(WEB_MERCATOR_ORIGIN, 6)
    expect(maxY).toBeCloseTo(WEB_MERCATOR_ORIGIN, 6)
  })

  it('returns integer tiles covering a short radius', () => {
    const tiles = tilesForRadius(40, -75, 10, 8)
    expect(tiles.length).toBeGreaterThan(0)
    for (const t of tiles) {
      expect(Number.isInteger(t.x)).toBe(true)
      expect(Number.isInteger(t.y)).toBe(true)
    }
  })

  it('picks a tighter zoom for a shorter range', () => {
    const close = pickZoom(40, 8, 9, 16)
    const wide = pickZoom(40, 250, 9, 16)
    expect(close).toBeGreaterThanOrEqual(wide)
    expect(close).toBeGreaterThanOrEqual(4)
    expect(wide).toBeLessThanOrEqual(9)
  })
})
