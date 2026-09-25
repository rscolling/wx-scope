import { formatAge, formatBearing, formatClock, formatRange } from './geo.ts'
import { stampSweptSector, sweepCanvasAngle, sweepTurn } from './sweep.ts'
import type {
  ConnState,
  EnrichedStrike,
  GeoFix,
  PrecipNow,
  RadarFrame,
  SweepBright,
  SweepColor,
  SweepTrail,
  Units,
} from './types.ts'

export interface DrawInput {
  now: number
  origin: GeoFix | null
  rangeKm: number
  units: Units
  sweepSec: number
  radar: RadarFrame | null
  radarStatus: string
  strikes: EnrichedStrike[]
  alert: EnrichedStrike | null
  lightningState: ConnState
  fps: number
  precip: PrecipNow | null
  sweepColor: SweepColor
  sweepBright: SweepBright
  sweepTrail: SweepTrail
  pip: boolean
}

export class RadarDisplay {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private phosphor: HTMLCanvasElement
  private pctx: CanvasRenderingContext2D
  private returns: HTMLCanvasElement
  private rctx: CanvasRenderingContext2D
  private srcScratch: HTMLCanvasElement
  private sctx: CanvasRenderingContext2D
  private srcData: ImageData | null = null
  private dstData: ImageData | null = null
  private srcKey = ''
  private lastSweepTurn: number | null = null
  private lastLook = ''

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d')
    this.ctx = ctx
    this.phosphor = document.createElement('canvas')
    const pctx = this.phosphor.getContext('2d')
    if (!pctx) throw new Error('no 2d')
    this.pctx = pctx
    this.returns = document.createElement('canvas')
    const rctx = this.returns.getContext('2d', { willReadFrequently: true })
    if (!rctx) throw new Error('no 2d')
    this.rctx = rctx
    this.srcScratch = document.createElement('canvas')
    const sctx = this.srcScratch.getContext('2d', { willReadFrequently: true })
    if (!sctx) throw new Error('no 2d')
    this.sctx = sctx
  }

  render(input: DrawInput): void {
    const canvas = this.canvas
    const parent = canvas.parentElement
    if (!parent) return
    const cssW = parent.clientWidth
    const cssH = parent.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const pad = input.pip ? 2 : 28
    const size = Math.max(input.pip ? 32 : 120, Math.min(cssW, cssH) - pad * 2)
    const cx = cssW / 2
    const cy = cssH / 2
    const r = size / 2
    const inner = input.pip ? r - 1.5 : r - 18

    this.ensurePhosphor(inner * 2)

    if (input.pip) {
      ctx.clearRect(0, 0, cssW, cssH)
    } else {
      ctx.fillStyle = '#05070a'
      ctx.fillRect(0, 0, cssW, cssH)
      this.drawBezel(ctx, cx, cy, r)
    }
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, inner, 0, Math.PI * 2)
    ctx.clip()

    const look = palette(input)
    const g = ctx.createRadialGradient(cx, cy, inner * 0.08, cx, cy, inner)
    g.addColorStop(0, '#0a0c0e')
    g.addColorStop(0.7, '#060708')
    g.addColorStop(1, '#020403')
    ctx.fillStyle = g
    ctx.fill()

    if (input.radar?.mapBitmap) {
      ctx.save()
      ctx.globalAlpha = 0.92
      ctx.drawImage(input.radar.mapBitmap, cx - inner, cy - inner, inner * 2, inner * 2)
      ctx.restore()
    }

    this.advanceReturns(input, look)
    if (this.returns.width > 0 && input.radar?.bitmap) {
      ctx.save()
      ctx.globalAlpha = 0.92
      ctx.drawImage(this.returns, cx - inner, cy - inner, inner * 2, inner * 2)
      ctx.restore()
    }

    this.advancePhosphor(input, inner, look)
    ctx.save()
    ctx.globalCompositeOperation = look.gain > 0.9 ? 'lighter' : 'source-over'
    ctx.globalAlpha = look.on ? Math.min(0.9, 0.35 + look.gain * 0.45) : 0.55
    ctx.drawImage(this.phosphor, cx - inner, cy - inner, inner * 2, inner * 2)
    ctx.restore()
    this.drawRings(ctx, cx, cy, inner, input.rangeKm, input.units, look, !input.pip)
    this.drawStrikes(ctx, cx, cy, inner, input)
    if (input.alert && !input.pip) this.drawCallout(ctx, cx, cy, inner, input)
    this.drawSweep(ctx, cx, cy, inner, input, look)
    this.drawCenter(ctx, cx, cy, look)

    ctx.restore()

    if (input.pip) {
      ctx.beginPath()
      ctx.arc(cx, cy, inner + 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(168, 176, 172, 0.8)'
      ctx.lineWidth = 1
      ctx.stroke()
    } else {
      this.drawCardinals(ctx, cx, cy, inner, look)
      this.drawHud(ctx, cssW, cssH, input)
    }
  }

  private ensurePhosphor(px: number): void {
    const s = Math.max(48, Math.round(px))
    if (this.phosphor.width !== s || this.phosphor.height !== s) {
      this.phosphor.width = s
      this.phosphor.height = s
      this.pctx.setTransform(1, 0, 0, 1, 0, 0)
      this.pctx.fillStyle = '#000'
      this.pctx.fillRect(0, 0, s, s)
    }
  }

  private ensureReturns(size: number): void {
    if (this.returns.width === size && this.returns.height === size && this.dstData) return
    this.returns.width = size
    this.returns.height = size
    this.srcScratch.width = size
    this.srcScratch.height = size
    this.rctx.setTransform(1, 0, 0, 1, 0, 0)
    this.sctx.setTransform(1, 0, 0, 1, 0, 0)
    this.rctx.clearRect(0, 0, size, size)
    this.dstData = this.rctx.createImageData(size, size)
    this.srcData = null
    this.srcKey = ''
    this.lastSweepTurn = null
  }

  private syncSrc(bitmap: ImageBitmap | HTMLCanvasElement, size: number, paintedAt: number): void {
    const key = `${paintedAt}:${size}`
    if (this.srcKey === key && this.srcData) return
    this.srcKey = key
    this.sctx.clearRect(0, 0, size, size)
    this.sctx.drawImage(bitmap, 0, 0, size, size)
    this.srcData = this.sctx.getImageData(0, 0, size, size)
  }

  private advanceReturns(input: DrawInput, look: SweepLook): void {
    const layer = input.radar?.bitmap
    if (!layer) {
      if (this.returns.width) this.rctx.clearRect(0, 0, this.returns.width, this.returns.height)
      this.dstData = null
      this.srcData = null
      this.srcKey = ''
      this.lastSweepTurn = null
      return
    }
    const size = Math.max(1, layer.width)
    this.ensureReturns(size)
    this.syncSrc(layer, size, input.radar?.paintedAt ?? 0)
    const src = this.srcData
    const dst = this.dstData
    if (!src || !dst) return
    const turn = sweepTurn(input.now, input.sweepSec)
    if (!look.on) {
      dst.data.set(src.data)
      this.rctx.putImageData(dst, 0, 0)
      this.lastSweepTurn = turn
      return
    }
    if (this.lastSweepTurn == null) {
      this.lastSweepTurn = turn
      return
    }
    stampSweptSector(dst.data, src.data, size, this.lastSweepTurn, turn)
    this.lastSweepTurn = turn
    this.rctx.putImageData(dst, 0, 0)
  }

  private advancePhosphor(input: DrawInput, inner: number, look: SweepLook): void {
    const p = this.pctx
    const s = this.phosphor.width
    const lookKey = `${input.sweepColor}:${input.sweepBright}:${input.sweepTrail}`
    if (lookKey !== this.lastLook) {
      p.setTransform(1, 0, 0, 1, 0, 0)
      p.globalCompositeOperation = 'source-over'
      p.fillStyle = '#000'
      p.fillRect(0, 0, s, s)
      this.lastLook = lookKey
    }
    p.globalCompositeOperation = 'source-over'
    const fade = input.sweepTrail === 'long' ? 0.045 : 0.11
    p.fillStyle = `rgba(0, 0, 0, ${fade})`
    p.fillRect(0, 0, s, s)

    if (look.on && input.sweepTrail !== 'off') {
      const ang = sweepTurn(input.now, input.sweepSec) * Math.PI * 2
      const cx = s / 2
      const scale = s / 2 / inner
      p.save()
      p.translate(cx, cx)
      p.rotate(ang)
      const span = (16 * Math.PI) / 180
      const grd = p.createRadialGradient(0, 0, 0, 0, 0, s / 2)
      grd.addColorStop(0, rgba(look.r, look.g, look.b, 0.12 * look.gain))
      grd.addColorStop(1, rgba(look.r, look.g, look.b, 0.015 * look.gain))
      p.fillStyle = grd
      p.beginPath()
      p.moveTo(0, 0)
      p.arc(0, 0, s / 2, -Math.PI / 2 - span, -Math.PI / 2, false)
      p.closePath()
      p.fill()
      p.strokeStyle = rgba(look.r, look.g, look.b, 0.35 * look.gain)
      p.lineWidth = Math.max(1, 1.4 * scale * inner * 0.004)
      p.beginPath()
      p.moveTo(0, 0)
      p.lineTo(0, -s / 2)
      p.stroke()
      p.restore()
    }

    for (const st of input.strikes) {
      const age = input.now - st.time
      if (age > 1800) continue
      const pos = polar(s / 2, s / 2, s / 2, st.rangeKm, input.rangeKm, st.bearingDeg)
      const k = 1 - age / 1800
      p.globalCompositeOperation = 'lighter'
      p.fillStyle = `rgba(255, 250, 210, ${0.55 * k})`
      p.beginPath()
      p.arc(pos.x, pos.y, 6 * k + 2, 0, Math.PI * 2)
      p.fill()
    }
  }

  private drawBezel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const metal = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    metal.addColorStop(0, '#2a3238')
    metal.addColorStop(0.35, '#6d767c')
    metal.addColorStop(0.5, '#1b2024')
    metal.addColorStop(0.7, '#8a9398')
    metal.addColorStop(1, '#15191c')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = metal
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r - 10, 0, Math.PI * 2)
    ctx.fillStyle = '#070b09'
    ctx.fill()
    ctx.strokeStyle = 'rgba(120, 140, 130, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  private drawRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    inner: number,
    rangeKm: number,
    units: Units,
    look: SweepLook,
    labels: boolean,
  ): void {
    ctx.strokeStyle = rgba(look.ringR, look.ringG, look.ringB, labels ? 0.28 : 0.22)
    ctx.fillStyle = rgba(look.ringR, look.ringG, look.ringB, 0.7)
    ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const rings = labels ? 4 : 2
    for (let i = 1; i <= rings; i++) {
      const rr = (inner * i) / rings
      ctx.lineWidth = i === rings ? 1.2 : 1
      ctx.beginPath()
      ctx.arc(cx, cy, rr, 0, Math.PI * 2)
      ctx.stroke()
      if (!labels) continue
      const label = formatRange((rangeKm * i) / rings, units, i === 1 ? 1 : 0)
      const rad = (-48 * Math.PI) / 180
      const lr = rr - 10
      ctx.fillText(label, cx + Math.cos(rad) * lr + 4, cy + Math.sin(rad) * lr)
    }
    if (!labels) return
    ctx.strokeStyle = rgba(look.ringR, look.ringG, look.ringB, 0.14)
    ctx.lineWidth = 1
    for (let a = 0; a < 360; a += 30) {
      const rad = ((a - 90) * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(rad) * 8, cy + Math.sin(rad) * 8)
      ctx.lineTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner)
      ctx.stroke()
    }
  }

  private drawStrikes(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    inner: number,
    input: DrawInput,
  ): void {
    for (const st of input.strikes) {
      const age = input.now - st.time
      if (age > 20 * 60_000) continue
      const pos = polar(cx, cy, inner, st.rangeKm, input.rangeKm, st.bearingDeg)
      const color = strikeColor(st, age)
      const size = st.classification === 'overhead' ? 7 : st.classification === 'close' ? 5.5 : 3.2
      ctx.save()
      ctx.translate(pos.x, pos.y)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.globalAlpha = Math.max(0.25, 1 - age / (18 * 60_000))
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(-size, 0)
      ctx.lineTo(size, 0)
      ctx.moveTo(0, -size)
      ctx.lineTo(0, size)
      ctx.stroke()
      if (st.classification === 'close' || st.classification === 'overhead') {
        ctx.beginPath()
        ctx.arc(0, 0, size + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      const flash = 1 - Math.min(1, age / 900)
      if (flash > 0) {
        ctx.globalAlpha = flash
        ctx.beginPath()
        ctx.arc(0, 0, size + 10 * (1 - flash) + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private drawCallout(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    inner: number,
    input: DrawInput,
  ): void {
    const alert = input.alert
    if (!alert) return
    const pos = polar(cx, cy, inner, alert.rangeKm, input.rangeKm, alert.bearingDeg)
    const pulse = 0.55 + 0.45 * Math.sin(input.now / 120)
    ctx.save()
    ctx.strokeStyle = `rgba(255, 80, 80, ${0.7 * pulse})`
    ctx.lineWidth = 1.2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, 11 + 3 * pulse, 0, Math.PI * 2)
    ctx.stroke()

    const tag = alert.classification === 'overhead' ? 'OVERHEAD' : 'CLOSE STRIKE'
    const line1 = tag
    const line2 = `${formatRange(alert.rangeKm, input.units, 1)}  ${formatBearing(alert.bearingDeg)}`
    const line3 = `${formatAge(input.now - alert.time)}  ${alert.id.slice(0, 12)}`
    const boxW = 168
    const boxH = 52
    let bx = pos.x + 14
    let by = pos.y - boxH - 8
    if (bx + boxW > cx + inner - 8) bx = pos.x - boxW - 14
    if (by < cy - inner + 8) by = pos.y + 12
    ctx.fillStyle = 'rgba(12, 4, 4, 0.82)'
    ctx.strokeStyle = '#ff6b6b'
    ctx.lineWidth = 1
    ctx.fillRect(bx, by, boxW, boxH)
    ctx.strokeRect(bx, by, boxW, boxH)
    ctx.fillStyle = '#ff8a8a'
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(line1, bx + 8, by + 6)
    ctx.fillStyle = '#ffe8e8'
    ctx.fillText(line2, bx + 8, by + 22)
    ctx.fillStyle = '#c9a0a0'
    ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace'
    ctx.fillText(line3, bx + 8, by + 36)
    ctx.restore()
  }

  private drawSweep(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    inner: number,
    input: DrawInput,
    look: SweepLook,
  ): void {
    if (!look.on) return
    const ang = sweepCanvasAngle(sweepTurn(input.now, input.sweepSec))
    ctx.save()
    ctx.strokeStyle = rgba(look.r, look.g, look.b, 0.55 * look.gain)
    ctx.lineWidth = look.gain > 0.9 ? 2 : 1.25
    ctx.shadowColor = rgba(look.r, look.g, look.b, 0.65)
    ctx.shadowBlur = look.glow
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner)
    ctx.stroke()
    ctx.restore()
  }

  private drawCenter(ctx: CanvasRenderingContext2D, cx: number, cy: number, look: SweepLook): void {
    ctx.strokeStyle = rgba(look.ringR, look.ringG, look.ringB, 0.85)
    ctx.fillStyle = rgba(look.ringR, look.ringG, look.ringB, 0.85)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy)
    ctx.lineTo(cx + 10, cy)
    ctx.moveTo(cx, cy - 10)
    ctx.lineTo(cx, cy + 10)
    ctx.stroke()
  }

  private drawCardinals(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    inner: number,
    look: SweepLook,
  ): void {
    const marks: [string, number][] = [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['W', 270],
    ]
    ctx.fillStyle = rgba(look.ringR, look.ringG, look.ringB, 0.9)
    ctx.font = '700 14px Rajdhani, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [label, deg] of marks) {
      const rad = ((deg - 90) * Math.PI) / 180
      const rr = inner + 14
      ctx.fillText(label, cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr)
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, input: DrawInput): void {
    ctx.font = '12px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#c8d4c0'
    ctx.textAlign = 'left'
    const range = formatRange(input.rangeKm, input.units, 0)
    const src = input.radar?.sourceName ?? input.radarStatus.toUpperCase()
    ctx.fillText(`RNG ${range}`, 16, 14)
    ctx.fillStyle = '#9aa7a0'
    ctx.fillText(`SRC ${src}`, 16, 32)
    if (input.radar?.dataTime) {
      ctx.fillText(`RAD ${formatAge(input.now - input.radar.dataTime)}`, 16, 50)
    }
    if (input.precip) {
      ctx.fillStyle = input.precip.wet ? '#7ecbff' : '#9aa7a0'
      const amt =
        input.units === 'km'
          ? `${input.precip.lastHourMm.toFixed(1)} MM`
          : `${input.precip.lastHourIn.toFixed(3)} IN`
      ctx.fillText(`PCP ${input.precip.label}  ${amt} 1H`, 16, 68)
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = '#c8d4c0'
    ctx.fillText(formatClock(new Date(input.now)), w - 16, 14)
    ctx.fillStyle = '#9aa7a0'
    ctx.fillText(`${input.fps.toFixed(0)} FPS`, w - 16, 32)
    ctx.fillText(`LTNG ${input.lightningState.toUpperCase()}`, w - 16, 50)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    if (input.origin) {
      ctx.fillStyle = '#c8d4c0'
      ctx.fillText(
        `${input.origin.lat.toFixed(4)}  ${input.origin.lon.toFixed(4)}  ${input.origin.label}`,
        16,
        h - 16,
      )
    } else {
      ctx.fillStyle = '#ffbf66'
      ctx.fillText('NO FIX — waiting for location', 16, h - 16)
    }

    const close = input.strikes.filter((s) => s.classification === 'close' || s.classification === 'overhead')
    ctx.textAlign = 'right'
    ctx.fillStyle = close.length ? '#ff6b6b' : '#9aa7a0'
    ctx.fillText(`${close.length} CLOSE / ${input.strikes.length} IN RNG`, w - 16, h - 16)
  }
}

function polar(
  cx: number,
  cy: number,
  inner: number,
  rangeKm: number,
  maxKm: number,
  bearing: number,
): { x: number; y: number } {
  const t = Math.min(1, rangeKm / maxKm)
  const rad = ((bearing - 90) * Math.PI) / 180
  return {
    x: cx + Math.cos(rad) * t * inner,
    y: cy + Math.sin(rad) * t * inner,
  }
}

interface SweepLook {
  on: boolean
  r: number
  g: number
  b: number
  ringR: number
  ringG: number
  ringB: number
  gain: number
  glow: number
}

const COLORS: Record<Exclude<SweepColor, 'off'>, [number, number, number]> = {
  dim: [132, 154, 142],
  phosphor: [125, 255, 179],
  amber: [232, 176, 96],
  ice: [140, 196, 214],
  white: [210, 214, 218],
}

function palette(input: DrawInput): SweepLook {
  const gain = input.sweepBright === 'high' ? 1.15 : input.sweepBright === 'med' ? 0.78 : 0.42
  const glow = input.sweepBright === 'high' ? 14 : input.sweepBright === 'med' ? 7 : 0
  if (input.sweepColor === 'off') {
    return { on: false, r: 140, g: 150, b: 145, ringR: 140, ringG: 150, ringB: 145, gain: 0, glow: 0 }
  }
  const [r, g, b] = COLORS[input.sweepColor]
  const ring = input.sweepColor === 'phosphor' ? [125, 255, 179] : [150, 164, 158]
  return {
    on: true,
    r,
    g,
    b,
    ringR: ring[0],
    ringG: ring[1],
    ringB: ring[2],
    gain,
    glow,
  }
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
}

function strikeColor(st: EnrichedStrike, age: number): string {
  if (st.classification === 'overhead') return '#ff4d4d'
  if (st.classification === 'close') return '#ffb347'
  if (age < 15_000) return '#f8ffe8'
  if (age < 120_000) return '#ffe566'
  if (age < 600_000) return '#ff9f43'
  return '#c0392b'
}
