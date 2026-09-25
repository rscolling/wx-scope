import { destination, isConus, latLonToWorld, pickZoom, tilesForRadius } from './geo.ts'
import type { RadarFrame, RadarSource } from './types.ts'

const IEM_HSR = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-hsr-900913'
const IEM_N0Q = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913'
const RV_MAPS = 'https://api.rainviewer.com/public/weather-maps.json'
const STREET =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile'
const TILE = 256
const MAX_RADAR_TILES = 16
const MAX_MAP_TILES = 36

interface RvMaps {
  generated: number
  host: string
  radar: { past: { time: number; path: string }[] }
}

interface Mosaic {
  data: Uint8ClampedArray
  width: number
  height: number
  minX: number
  minY: number
  z: number
  count: number
}

export interface LayerOpts {
  radar: boolean
  map: boolean
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`tile fail ${url}`))
    img.src = url
  })
}

async function fetchRv(): Promise<{ host: string; path: string; time: number } | null> {
  const res = await fetch(RV_MAPS)
  if (!res.ok) throw new Error(`RainViewer ${res.status}`)
  const json = (await res.json()) as RvMaps
  const past = json.radar?.past ?? []
  const last = past[past.length - 1]
  if (!last) return null
  return { host: json.host, path: last.path, time: last.time * 1000 }
}

function resolveSource(
  source: RadarSource,
  lat: number,
  lon: number,
): 'iem' | 'rainviewer' {
  if (source === 'iem') return 'iem'
  if (source === 'rainviewer') return 'rainviewer'
  return isConus(lat, lon) ? 'iem' : 'rainviewer'
}

async function loadMosaic(
  lat: number,
  lon: number,
  rangeKm: number,
  maxZ: number,
  maxTiles: number,
  urlFor: (tile: { x: number; y: number }, z: number) => string,
): Promise<Mosaic> {
  let z = pickZoom(lat, rangeKm, maxZ, maxTiles)
  let tiles = tilesForRadius(lat, lon, rangeKm, z)
  while (tiles.length > maxTiles && z > 4) {
    z--
    tiles = tilesForRadius(lat, lon, rangeKm, z)
  }
  const loaded = await Promise.allSettled(tiles.map((t) => loadImage(urlFor(t, z))))
  const ok: { x: number; y: number; img: HTMLImageElement }[] = []
  tiles.forEach((t, i) => {
    const r = loaded[i]
    if (r.status === 'fulfilled') ok.push({ ...t, img: r.value })
  })
  if (ok.length === 0) throw new Error('no tiles')
  const minX = Math.min(...ok.map((t) => t.x))
  const minY = Math.min(...ok.map((t) => t.y))
  const maxX = Math.max(...ok.map((t) => t.x))
  const maxY = Math.max(...ok.map((t) => t.y))
  const mosaic = document.createElement('canvas')
  mosaic.width = (maxX - minX + 1) * TILE
  mosaic.height = (maxY - minY + 1) * TILE
  const mctx = mosaic.getContext('2d', { willReadFrequently: true })
  if (!mctx) throw new Error('no 2d')
  for (const t of ok) {
    mctx.drawImage(t.img, (t.x - minX) * TILE, (t.y - minY) * TILE)
  }
  const img = mctx.getImageData(0, 0, mosaic.width, mosaic.height)
  return {
    data: img.data,
    width: img.width,
    height: img.height,
    minX,
    minY,
    z,
    count: ok.length,
  }
}

function sampleMosaic(
  m: Mosaic,
  lat: number,
  lon: number,
): [number, number, number, number] | null {
  const w = latLonToWorld(lat, lon, m.z)
  const sx = (w.x - m.minX) * TILE
  const sy = (w.y - m.minY) * TILE
  if (sx < 1 || sy < 1 || sx >= m.width - 2 || sy >= m.height - 2) return null
  return sampleBilinear(m.data, m.width, m.height, sx, sy)
}

export class RadarFeed {
  frame: RadarFrame | null = null
  status = 'idle'
  lastError = ''
  onUpdate: ((f: RadarFrame | null) => void) | null = null

  private gen = 0
  private timer: number | null = null

  async refresh(
    lat: number,
    lon: number,
    rangeKm: number,
    source: RadarSource,
    sizePx: number,
    layers: LayerOpts,
  ): Promise<void> {
    const gen = ++this.gen
    if (!layers.radar && !layers.map) {
      this.frame = null
      this.status = 'idle'
      this.onUpdate?.(null)
      return
    }
    this.status = 'fetching'
    try {
      const built = await this.paint(lat, lon, rangeKm, source, sizePx, layers, gen)
      if (gen !== this.gen || !built) return
      this.frame = built
      this.status = 'live'
      this.lastError = ''
      this.onUpdate?.(built)
    } catch (err) {
      if (gen !== this.gen) return
      this.lastError = err instanceof Error ? err.message : String(err)
      this.status = 'error'
      this.onUpdate?.(this.frame)
    }
  }

  startLoop(
    getArgs: () => {
      lat: number
      lon: number
      rangeKm: number
      source: RadarSource
      sizePx: number
      enabled: boolean
      layers: LayerOpts
    },
  ): void {
    const tick = () => {
      const args = getArgs()
      if (args.enabled) {
        void this.refresh(args.lat, args.lon, args.rangeKm, args.source, args.sizePx, args.layers)
      }
    }
    tick()
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = window.setInterval(tick, 60_000)
  }

  stop(): void {
    this.gen++
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = null
  }

  private async paint(
    lat: number,
    lon: number,
    rangeKm: number,
    source: RadarSource,
    sizePx: number,
    layers: LayerOpts,
    gen: number,
  ): Promise<RadarFrame | null> {
    const resolved = resolveSource(source, lat, lon)
    const bust = Math.floor(Date.now() / 30_000)

    let dataTime: number | null = Date.now()
    const names: string[] = []

    const streetP: Promise<Mosaic | null> = layers.map
      ? loadMosaic(lat, lon, rangeKm, 16, MAX_MAP_TILES, (tile, z) => {
          return `${STREET}/${z}/${tile.y}/${tile.x}`
        }).catch(() => null)
      : Promise.resolve(null)

    const radarP: Promise<Mosaic | null> = layers.radar
      ? (async () => {
          if (resolved === 'iem') {
            try {
              const m = await loadMosaic(lat, lon, rangeKm, 9, MAX_RADAR_TILES, (tile, z) => {
                return `${IEM_HSR}/${z}/${tile.x}/${tile.y}.png?t=${bust}`
              })
              names.push('IEM MRMS')
              return m
            } catch {
              const m = await loadMosaic(lat, lon, rangeKm, 9, MAX_RADAR_TILES, (tile, z) => {
                return `${IEM_N0Q}/${z}/${tile.x}/${tile.y}.png?t=${bust}`
              })
              names.push('IEM NEXRAD')
              return m
            }
          }
          const meta = await fetchRv()
          if (!meta) throw new Error('no RainViewer frames')
          dataTime = meta.time
          const m = await loadMosaic(lat, lon, rangeKm, 7, MAX_RADAR_TILES, (tile, z) => {
            return `${meta.host}${meta.path}/256/${z}/${tile.x}/${tile.y}/2/1_1.png`
          })
          names.push('RainViewer')
          return m
        })().catch((err) => {
          if (!layers.map) throw err
          return null
        })
      : Promise.resolve(null)

    const [streets, radarM] = await Promise.all([streetP, radarP])
    if (streets) names.unshift('STREETS')
    if (gen !== this.gen) return null
    if (!streets && !radarM) throw new Error('no map or radar tiles')

    const size = Math.max(256, Math.min(768, Math.round(sizePx)))
    const cx = (size - 1) / 2
    const pxPerKm = size / 2 / rangeKm

    const mapL = streets ? polarLayer(size) : null
    const radL = radarM ? polarLayer(size) : null

    for (let py = 0; py < size; py++) {
      const dy = py - cx
      for (let px = 0; px < size; px++) {
        const dx = px - cx
        const rPx = Math.hypot(dx, dy)
        if (rPx > cx) continue
        const range = rPx / pxPerKm
        const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
        const geo = destination(lat, lon, bearing, range)
        const di = (py * size + px) * 4
        if (streets && mapL) {
          const s = sampleMosaic(streets, geo.lat, geo.lon)
          if (s) {
            mapL.data[di] = s[0] * 0.88
            mapL.data[di + 1] = s[1] * 0.88
            mapL.data[di + 2] = s[2] * 0.88
            mapL.data[di + 3] = 255
          }
        }
        if (radarM && radL) {
          const c = sampleMosaic(radarM, geo.lat, geo.lon)
          if (c && c[0] + c[1] + c[2] >= 18) {
            radL.data[di] = c[0]
            radL.data[di + 1] = c[1]
            radL.data[di + 2] = c[2]
            radL.data[di + 3] = 255
          }
        }
      }
    }
    mapL?.ctx.putImageData(mapL.img, 0, 0)
    radL?.ctx.putImageData(radL.img, 0, 0)
    return {
      bitmap: radL?.canvas ?? null,
      mapBitmap: mapL?.canvas ?? null,
      paintedAt: Date.now(),
      dataTime,
      sourceName: names.join(' + ') || 'SCOPE',
      tileCount: (streets?.count ?? 0) + (radarM?.count ?? 0),
    }
  }
}

function polarLayer(size: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  img: ImageData
  data: Uint8ClampedArray
} {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d')
  const img = ctx.createImageData(size, size)
  return { canvas, ctx, img, data: img.data }
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let k = 0; k < 4; k++) {
    const v0 = data[i00 + k] * (1 - fx) + data[i10 + k] * fx
    const v1 = data[i01 + k] * (1 - fx) + data[i11 + k] * fx
    out[k] = v0 * (1 - fy) + v1 * fy
  }
  return out
}
