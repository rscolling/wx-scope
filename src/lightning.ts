import { haversineKm, bearingDeg } from './geo.ts'
import type { ConnState, EnrichedStrike, RawStrike, StrikeClass } from './types.ts'

const HOSTS = ['ws1', 'ws3', 'ws7', 'ws8']
const KEEP_MS = 30 * 60_000
const MAX_STRIKES = 2500

function lzwDecode(b: string): string {
  const e: Record<number, string> = {}
  const d = b.split('')
  if (d.length === 0) return ''
  let c = d[0]
  let f = c
  const g = [c]
  const h = 256
  let o = h
  for (let i = 1; i < d.length; i++) {
    const code = d[i].charCodeAt(0)
    const a = h > code ? d[i] : e[code] ? e[code] : f + c
    g.push(a)
    c = a.charAt(0)
    e[o] = f + c
    o++
    f = a
  }
  return g.join('')
}

async function eventText(ev: MessageEvent): Promise<string> {
  const data = ev.data
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (data instanceof Blob) return data.text()
  return String(data)
}

function parseStrikePayload(raw: string): RawStrike | null {
  let json = raw
  try {
    JSON.parse(raw)
  } catch {
    try {
      json = lzwDecode(raw)
    } catch {
      return null
    }
  }
  let obj: {
    lat?: number
    lon?: number
    time?: number
    pol?: number
  }
  try {
    obj = JSON.parse(json) as typeof obj
  } catch {
    return null
  }
  if (typeof obj.lat !== 'number' || typeof obj.lon !== 'number') return null
  const timeNs = typeof obj.time === 'number' ? obj.time : Date.now() * 1e6
  const time = timeNs > 1e15 ? Math.floor(timeNs / 1e6) : timeNs > 1e12 ? Math.floor(timeNs / 1e3) : timeNs
  return {
    id: `S${time.toString(36)}-${Math.abs(Math.round(obj.lat * 1000))}`,
    lat: obj.lat,
    lon: obj.lon,
    time,
    polarity: typeof obj.pol === 'number' ? obj.pol : 0,
  }
}

export function classify(rangeKm: number, closeMi: number, rangeMi: number): StrikeClass | null {
  const rangeM = rangeKm * 0.621371
  if (rangeM > rangeMi + 0.5) return null
  if (rangeM < 1) return 'overhead'
  if (rangeM <= closeMi) return 'close'
  if (rangeM <= 10) return 'near'
  return 'area'
}

export function enrich(
  strike: RawStrike,
  lat: number,
  lon: number,
  closeMi: number,
  rangeMi: number,
): EnrichedStrike | null {
  const rangeKm = haversineKm(lat, lon, strike.lat, strike.lon)
  const classification = classify(rangeKm, closeMi, rangeMi)
  if (!classification) return null
  return {
    ...strike,
    rangeKm,
    bearingDeg: bearingDeg(lat, lon, strike.lat, strike.lon),
    classification,
  }
}

export class LightningNet {
  state: ConnState = 'off'
  lastError = ''
  strikes: RawStrike[] = []
  onStrike: ((s: RawStrike) => void) | null = null
  onState: ((s: ConnState) => void) | null = null

  private ws: WebSocket | null = null
  private hostIndex = 0
  private retryMs = 1000
  private timer: number | null = null
  private stopped = true
  private seq = 0

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.timer != null) window.clearTimeout(this.timer)
    this.timer = null
    this.ws?.close()
    this.ws = null
    this.setState('off')
  }

  inRange(lat: number, lon: number, closeMi: number, rangeMi: number, maxAgeMs = KEEP_MS): EnrichedStrike[] {
    const cutoff = Date.now() - maxAgeMs
    const out: EnrichedStrike[] = []
    for (const s of this.strikes) {
      if (s.time < cutoff) continue
      const e = enrich(s, lat, lon, closeMi, rangeMi)
      if (e) out.push(e)
    }
    out.sort((a, b) => a.rangeKm - b.rangeKm)
    return out
  }

  closest(lat: number, lon: number, closeMi: number, rangeMi: number, windowMs: number): EnrichedStrike | null {
    const list = this.inRange(lat, lon, closeMi, rangeMi, windowMs)
    return list[0] ?? null
  }

  private setState(s: ConnState): void {
    this.state = s
    this.onState?.(s)
  }

  private connect(): void {
    if (this.stopped) return
    this.ws?.close()
    this.setState('connecting')
    const hosts = this.hosts()
    const host = hosts[this.hostIndex % hosts.length]
    this.hostIndex++
    let url = host
    try {
      this.ws = new WebSocket(url)
    } catch (err) {
      this.lastError = String(err)
      this.scheduleRetry()
      return
    }
    const ws = this.ws
    ws.onopen = () => {
      this.retryMs = 1000
      this.setState('live')
      try {
        ws.send(JSON.stringify({ a: 111 }))
      } catch {
        /* ignore */
      }
    }
    ws.onmessage = (ev) => {
      void this.handleMessage(ev)
    }
    ws.onerror = () => {
      this.lastError = 'socket error'
    }
    ws.onclose = () => {
      if (this.stopped) return
      this.setState('error')
      this.scheduleRetry()
    }
  }

  private hosts(): string[] {
    const remote = HOSTS.map((h) => `wss://${h}.blitzortung.org`)
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      return [...remote, `${proto}://${location.host}/blitz-ws`]
    }
    return remote
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    if (this.timer != null) window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.connect(), this.retryMs)
    this.retryMs = Math.min(15_000, this.retryMs * 1.6)
  }

  private async handleMessage(ev: MessageEvent): Promise<void> {
    const text = await eventText(ev)
    const strike = parseStrikePayload(text)
    if (!strike) return
    this.seq++
    strike.id = `${strike.id}-${this.seq}`
    this.strikes.push(strike)
    if (this.strikes.length > MAX_STRIKES) {
      this.strikes.splice(0, this.strikes.length - MAX_STRIKES)
    }
    const cutoff = Date.now() - KEEP_MS
    if (this.strikes.length > 200 && this.strikes[0].time < cutoff) {
      this.strikes = this.strikes.filter((s) => s.time >= cutoff)
    }
    this.onStrike?.(strike)
  }
}


