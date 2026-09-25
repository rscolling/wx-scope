import { describe, expect, it } from 'vitest'
import { inSweptArc, pixelTurn, stampSweptSector, sweepCanvasAngle, sweepTurn } from './sweep.ts'

function xyAt(size: number, turn: number, radiusFrac = 0.6): { x: number; y: number } {
  const cx = (size - 1) / 2
  const r = radiusFrac * cx
  const ang = sweepCanvasAngle(turn)
  return {
    x: Math.round(cx + Math.cos(ang) * r),
    y: Math.round(cx + Math.sin(ang) * r),
  }
}

function setPx(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  rgba: [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (y * size + x) * 4
  data[i] = rgba[0]
  data[i + 1] = rgba[1]
  data[i + 2] = rgba[2]
  data[i + 3] = rgba[3]
}

function getPx(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * size + x) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

function paintBlob(
  data: Uint8ClampedArray,
  size: number,
  turn: number,
  rgba: [number, number, number, number],
): { x: number; y: number } {
  const { x, y } = xyAt(size, turn)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) setPx(data, size, x + dx, y + dy, rgba)
  }
  return { x, y }
}

describe('sweep geometry', () => {
  it('puts turn 0 at north and 0.25 at east', () => {
    expect(pixelTurn(0, -10)).toBeCloseTo(0, 6)
    expect(pixelTurn(10, 0)).toBeCloseTo(0.25, 6)
    expect(pixelTurn(0, 10)).toBeCloseTo(0.5, 6)
    expect(pixelTurn(-10, 0)).toBeCloseTo(0.75, 6)
  })

  it('matches the PPI sweep line angle', () => {
    expect(sweepCanvasAngle(0)).toBeCloseTo(-Math.PI / 2, 10)
    expect(sweepCanvasAngle(0.25)).toBeCloseTo(0, 10)
    expect(sweepTurn(2400, 2.4)).toBeCloseTo(1, 10)
  })

  it('includes the azimuth the beam just passed and excludes the start', () => {
    expect(inSweptArc(0.15, 0.1, 0.2)).toBe(true)
    expect(inSweptArc(0.2, 0.1, 0.2)).toBe(true)
    expect(inSweptArc(0.1, 0.1, 0.2)).toBe(false)
    expect(inSweptArc(0.25, 0.1, 0.2)).toBe(false)
  })

  it('wraps the arc past north', () => {
    expect(inSweptArc(0.99, 0.95, 0.05)).toBe(true)
    expect(inSweptArc(0.02, 0.95, 0.05)).toBe(true)
    expect(inSweptArc(0.5, 0.95, 0.05)).toBe(false)
  })
})

describe('stampSweptSector', () => {
  it('does not refresh precipitation until the sweep moves past that azimuth', () => {
    const size = 64
    const src = new Uint8ClampedArray(size * size * 4)
    const dst = new Uint8ClampedArray(size * size * 4)

    const east = paintBlob(src, size, 0.25, [0, 220, 80, 255])
    paintBlob(dst, size, 0.25, [180, 40, 40, 255])
    const west = paintBlob(src, size, 0.75, [40, 80, 220, 255])
    paintBlob(dst, size, 0.75, [220, 200, 40, 255])

    stampSweptSector(dst, src, size, 0, 0.5)

    expect(getPx(dst, size, east.x, east.y)).toEqual([0, 220, 80, 255])
    expect(getPx(dst, size, west.x, west.y)).toEqual([220, 200, 40, 255])
  })

  it('refreshes the remaining half on the next sweep, wrapping past north', () => {
    const size = 64
    const src = new Uint8ClampedArray(size * size * 4)
    const dst = new Uint8ClampedArray(size * size * 4)

    const east = paintBlob(src, size, 0.25, [0, 220, 80, 255])
    paintBlob(dst, size, 0.25, [180, 40, 40, 255])
    const west = paintBlob(src, size, 0.75, [40, 80, 220, 255])
    paintBlob(dst, size, 0.75, [220, 200, 40, 255])

    stampSweptSector(dst, src, size, 0, 0.5)
    stampSweptSector(dst, src, size, 0.5, 1)

    expect(getPx(dst, size, east.x, east.y)).toEqual([0, 220, 80, 255])
    expect(getPx(dst, size, west.x, west.y)).toEqual([40, 80, 220, 255])
  })

  it('clears a cell when the new frame has no return there and the sweep passes', () => {
    const size = 64
    const src = new Uint8ClampedArray(size * size * 4)
    const dst = new Uint8ClampedArray(size * size * 4)
    const east = paintBlob(dst, size, 0.25, [180, 40, 40, 255])

    stampSweptSector(dst, src, size, 0, 0.5)

    expect(getPx(dst, size, east.x, east.y)).toEqual([0, 0, 0, 0])
  })

  it('replaces the whole frame after a skipped revolution', () => {
    const size = 32
    const src = new Uint8ClampedArray(size * size * 4)
    const dst = new Uint8ClampedArray(size * size * 4)
    src.fill(9)
    dst.fill(3)
    stampSweptSector(dst, src, size, 0.2, 1.2)
    expect(Array.from(dst)).toEqual(Array.from(src))
  })

  it('leaves the buffer unchanged when the beam has not moved', () => {
    const size = 16
    const src = new Uint8ClampedArray(size * size * 4)
    const dst = new Uint8ClampedArray(size * size * 4)
    src.fill(9)
    dst.fill(3)
    stampSweptSector(dst, src, size, 0.4, 0.4)
    expect(dst[0]).toBe(3)
  })
})
