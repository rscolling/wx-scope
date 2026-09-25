export type Units = 'mi' | 'km'
export type RadarSource = 'auto' | 'iem' | 'rainviewer'
export type SweepColor = 'dim' | 'phosphor' | 'amber' | 'ice' | 'white' | 'off'
export type SweepBright = 'low' | 'med' | 'high'
export type SweepTrail = 'off' | 'short' | 'long'
export type StrikeClass = 'overhead' | 'close' | 'near' | 'area'
export type ConnState = 'off' | 'connecting' | 'live' | 'error'

export interface GeoFix {
  lat: number
  lon: number
  label: string
  accuracyM?: number
  source: 'gps' | 'ip' | 'manual'
}

export interface RawStrike {
  id: string
  lat: number
  lon: number
  time: number
  polarity: number
}

export interface EnrichedStrike extends RawStrike {
  rangeKm: number
  bearingDeg: number
  classification: StrikeClass
}

export interface Settings {
  lat: number | null
  lon: number | null
  label: string
  rangeMi: number
  units: Units
  radarSource: RadarSource
  radarEnabled: boolean
  mapEnabled: boolean
  lightningEnabled: boolean
  closeMi: number
  audio: boolean
  sweepSec: number
  sweepColor: SweepColor
  sweepBright: SweepBright
  sweepTrail: SweepTrail
}

export interface PrecipNow {
  label: string
  detail: string
  lastHourIn: number
  lastHourMm: number
  code: number
  wet: boolean
  fetchedAt: number
}

export interface RadarFrame {
  /** Polar radar returns; transparent where there is no echo. */
  bitmap: ImageBitmap | HTMLCanvasElement | null
  /** Polar street map underlay, drawn in full (not gated by the sweep). */
  mapBitmap: ImageBitmap | HTMLCanvasElement | null
  paintedAt: number
  dataTime: number | null
  sourceName: string
  tileCount: number
}
