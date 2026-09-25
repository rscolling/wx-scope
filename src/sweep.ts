/** Sweep turn: 0 at north, increasing clockwise, 1 = full revolution. */

export function sweepTurn(nowMs: number, sweepSec: number): number {
  if (sweepSec <= 0) return 0
  return nowMs / 1000 / sweepSec
}

/** Canvas arc angle for a sweep turn (0 = east, clockwise because y is down). */
export function sweepCanvasAngle(turn: number): number {
  return turn * Math.PI * 2 - Math.PI / 2
}

export function pixelTurn(dx: number, dy: number): number {
  let t = Math.atan2(dx, -dy) / (Math.PI * 2)
  if (t < 0) t += 1
  return t
}

/**
 * Whether `t` (0..1 turn) lies in the clockwise arc (from, to] on the unit circle.
 * `from`/`to` are in [0, 1). When `to < from` the arc wraps past north.
 */
export function inSweptArc(t: number, from: number, to: number): boolean {
  const x = t - Math.floor(t)
  if (from <= to) return x > from && x <= to
  return x > from || x <= to
}

/**
 * Copy radar returns from `src` onto `dst` only in the sector the sweep just
 * passed. Turns may be unwrapped. A span >= 1 revolution replaces the whole
 * frame. Pixels outside the disc, and azimuths the beam has not reached, stay
 * as they were — including stale precipitation from the previous frame.
 */
const lutCache = new Map<number, Float32Array>()

function turnLut(size: number): Float32Array {
  let lut = lutCache.get(size)
  if (lut) return lut
  lut = new Float32Array(size * size)
  const cx = (size - 1) / 2
  const r2 = cx * cx
  for (let y = 0; y < size; y++) {
    const dy = y - cx
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      lut[y * size + x] = dx * dx + dy * dy > r2 ? -1 : pixelTurn(dx, dy)
    }
  }
  lutCache.set(size, lut)
  return lut
}

export function stampSweptSector(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
  size: number,
  fromTurn: number,
  toTurn: number,
): void {
  const span = toTurn - fromTurn
  if (span <= 0) return
  if (span >= 1) {
    dst.set(src)
    return
  }
  const from = ((fromTurn % 1) + 1) % 1
  const to = ((toTurn % 1) + 1) % 1
  const lut = turnLut(size)
  const n = size * size
  for (let p = 0; p < n; p++) {
    const t = lut[p]
    if (t < 0 || !inSweptArc(t, from, to)) continue
    const i = p * 4
    dst[i] = src[i]
    dst[i + 1] = src[i + 1]
    dst[i + 2] = src[i + 2]
    dst[i + 3] = src[i + 3]
  }
}
