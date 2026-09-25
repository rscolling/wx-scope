import type { ConnState, PrecipNow, Units } from './types.ts'

const WMO: Record<number, string> = {
  0: 'CLEAR',
  1: 'MAINLY CLEAR',
  2: 'PARTLY CLOUDY',
  3: 'OVERCAST',
  45: 'FOG',
  48: 'RIME FOG',
  51: 'LIGHT DRIZZLE',
  53: 'DRIZZLE',
  55: 'HEAVY DRIZZLE',
  56: 'FREEZING DRIZZLE',
  57: 'FREEZING DRIZZLE',
  61: 'LIGHT RAIN',
  63: 'RAIN',
  65: 'HEAVY RAIN',
  66: 'FREEZING RAIN',
  67: 'FREEZING RAIN',
  71: 'LIGHT SNOW',
  73: 'SNOW',
  75: 'HEAVY SNOW',
  77: 'SNOW GRAINS',
  80: 'RAIN SHOWERS',
  81: 'RAIN SHOWERS',
  82: 'VIOLENT SHOWERS',
  85: 'SNOW SHOWERS',
  86: 'SNOW SHOWERS',
  95: 'THUNDERSTORM',
  96: 'T-STORM HAIL',
  99: 'T-STORM HAIL',
}

function wmoLabel(code: number): string {
  return WMO[code] ?? `WMO ${code}`
}

function isWet(code: number, lastHourIn: number): boolean {
  if (lastHourIn >= 0.005) return true
  return code >= 51 && code !== 45 && code !== 48
}

export class PrecipFeed {
  current: PrecipNow | null = null
  status: ConnState = 'off'
  lastError = ''
  onUpdate: ((p: PrecipNow | null) => void) | null = null

  private timer: number | null = null
  private gen = 0

  async refresh(lat: number, lon: number, units: Units): Promise<void> {
    const gen = ++this.gen
    this.status = 'connecting'
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=precipitation,rain,showers,snowfall,weather_code,cloud_cover` +
        `&precipitation_unit=inch&timezone=auto`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`precip ${res.status}`)
      const json = (await res.json()) as {
        current?: {
          precipitation?: number
          rain?: number
          showers?: number
          snowfall?: number
          weather_code?: number
          cloud_cover?: number
        }
      }
      if (gen !== this.gen) return
      const cur = json.current ?? {}
      const lastHourIn = Number(cur.precipitation ?? 0)
      const lastHourMm = lastHourIn * 25.4
      const code = Number(cur.weather_code ?? 0)
      const wet = isWet(code, lastHourIn)
      const amount =
        units === 'km'
          ? `${lastHourMm < 0.1 ? lastHourMm.toFixed(1) : lastHourMm.toFixed(1)} MM`
          : `${lastHourIn < 0.1 ? lastHourIn.toFixed(3) : lastHourIn.toFixed(2)} IN`
      const clouds = typeof cur.cloud_cover === 'number' ? `${Math.round(cur.cloud_cover)}% CLOUD` : ''
      this.current = {
        label: wmoLabel(code),
        detail: `${amount} LAST HR${clouds ? ` · ${clouds}` : ''}`,
        lastHourIn,
        lastHourMm,
        code,
        wet,
        fetchedAt: Date.now(),
      }
      this.status = 'live'
      this.lastError = ''
      this.onUpdate?.(this.current)
    } catch (err) {
      if (gen !== this.gen) return
      this.status = 'error'
      this.lastError = err instanceof Error ? err.message : String(err)
      this.onUpdate?.(this.current)
    }
  }

  startLoop(getArgs: () => { lat: number; lon: number; units: Units; enabled: boolean }): void {
    const tick = () => {
      const args = getArgs()
      if (args.enabled) void this.refresh(args.lat, args.lon, args.units)
    }
    tick()
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = window.setInterval(tick, 120_000)
  }

  stop(): void {
    this.gen++
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = null
    this.status = 'off'
  }
}
