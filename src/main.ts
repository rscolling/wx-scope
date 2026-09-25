import './style.css'
import { AudioCue } from './audio.ts'
import { formatAge, formatBearing, formatRange, miToKm } from './geo.ts'
import { LightningNet, enrich } from './lightning.ts'
import { PrecipFeed } from './precip.ts'
import { RadarFeed } from './radar.ts'
import { RadarDisplay } from './render.ts'
import { loadSettings, saveSettings } from './settings.ts'
import type { EnrichedStrike, GeoFix, Settings, SweepBright, SweepColor, SweepTrail } from './types.ts'

declare global {
  interface Window {
    wxDesktop?: {
      openPip: () => Promise<void>
      closePip: () => Promise<void>
    }
  }
}

const isPip = new URLSearchParams(location.search).get('pip') === '1'
if (isPip) {
  document.documentElement.classList.add('pip')
  document.body.classList.add('pip')
  document.title = 'WX-SCOPE'
}

const settings: Settings = loadSettings()
const canvas = document.querySelector<HTMLCanvasElement>('#scope')!
const display = new RadarDisplay(canvas)
let floatDisplay: RadarDisplay | null = null
const radar = new RadarFeed()
const precip = new PrecipFeed()
const lightning = new LightningNet()
const audio = new AudioCue()

let origin: GeoFix | null =
  settings.lat != null && settings.lon != null
    ? {
        lat: settings.lat,
        lon: settings.lon,
        label: settings.label || 'SAVED',
        source: 'manual',
      }
    : null

let alert: EnrichedStrike | null = null
let alertUntil = 0
let fps = 0
let frames = 0
let fpsTs = performance.now()


const el = {
  lat: document.querySelector<HTMLInputElement>('#lat')!,
  lon: document.querySelector<HTMLInputElement>('#lon')!,
  label: document.querySelector<HTMLInputElement>('#label')!,
  range: document.querySelector<HTMLSelectElement>('#range')!,
  units: document.querySelector<HTMLSelectElement>('#units')!,
  source: document.querySelector<HTMLSelectElement>('#radar-source')!,
  close: document.querySelector<HTMLSelectElement>('#close')!,
  sweep: document.querySelector<HTMLSelectElement>('#sweep')!,
  sweepColor: document.querySelector<HTMLSelectElement>('#sweep-color')!,
  sweepBright: document.querySelector<HTMLSelectElement>('#sweep-bright')!,
  sweepTrail: document.querySelector<HTMLSelectElement>('#sweep-trail')!,
  radarOn: document.querySelector<HTMLInputElement>('#radar-on')!,
  mapOn: document.querySelector<HTMLInputElement>('#map-on')!,
  ltngOn: document.querySelector<HTMLInputElement>('#ltng-on')!,
  audioOn: document.querySelector<HTMLInputElement>('#audio-on')!,
  precipTitle: document.querySelector<HTMLDivElement>('#precip-title')!,
  precipDetail: document.querySelector<HTMLDivElement>('#precip-detail')!,
  precipCard: document.querySelector<HTMLDivElement>('#precip-card')!,
  pipMap: document.querySelector<HTMLSpanElement>('#pip-map')!,
  pipPrecip: document.querySelector<HTMLSpanElement>('#pip-precip')!,
  log: document.querySelector<HTMLDivElement>('#log')!,
  alertCard: document.querySelector<HTMLDivElement>('#alert-card')!,
  alertTitle: document.querySelector<HTMLDivElement>('#alert-title')!,
  alertDetail: document.querySelector<HTMLDivElement>('#alert-detail')!,
  fixHint: document.querySelector<HTMLDivElement>('#fix-hint')!,
  pipRadar: document.querySelector<HTMLSpanElement>('#pip-radar')!,
  pipLtng: document.querySelector<HTMLSpanElement>('#pip-ltng')!,
  pipFix: document.querySelector<HTMLSpanElement>('#pip-fix')!,
  stRange: document.querySelector<HTMLElement>('#st-range')!,
  st5: document.querySelector<HTMLElement>('#st-5')!,
  stClose: document.querySelector<HTMLElement>('#st-close')!,
  stNear: document.querySelector<HTMLElement>('#st-near')!,
}

function applyForm(): void {
  el.range.value = String(settings.rangeMi)
  el.units.value = settings.units
  el.source.value = settings.radarSource
  el.close.value = String(settings.closeMi)
  el.sweep.value = String(settings.sweepSec)
  el.sweepColor.value = settings.sweepColor
  el.sweepBright.value = settings.sweepBright
  el.sweepTrail.value = settings.sweepTrail
  el.radarOn.checked = settings.radarEnabled
  el.mapOn.checked = settings.mapEnabled
  el.ltngOn.checked = settings.lightningEnabled
  el.audioOn.checked = settings.audio
  if (origin) {
    el.lat.value = origin.lat.toFixed(4)
    el.lon.value = origin.lon.toFixed(4)
    el.label.value = origin.label
  }
  audio.enabled = settings.audio
}

function persist(): void {
  settings.lat = origin?.lat ?? null
  settings.lon = origin?.lon ?? null
  settings.label = origin?.label ?? settings.label
  saveSettings(settings)
}

function setOrigin(fix: GeoFix): void {
  origin = fix
  settings.lat = fix.lat
  settings.lon = fix.lon
  settings.label = fix.label
  el.lat.value = fix.lat.toFixed(4)
  el.lon.value = fix.lon.toFixed(4)
  el.label.value = fix.label
  el.fixHint.textContent = `${fix.source.toUpperCase()} ${fix.accuracyM ? `±${Math.round(fix.accuracyM)}m` : ''}`.trim()
  el.pipFix.dataset.state = 'live'
  persist()
  requestRadar()
  void precip.refresh(fix.lat, fix.lon, settings.units)
}

function rangeKm(): number {
  return miToKm(settings.rangeMi)
}

function requestRadar(): void {
  if (!origin) return
  if (!settings.radarEnabled && !settings.mapEnabled) {
    radar.frame = null
    return
  }
  const size = Math.min(canvas.parentElement?.clientWidth ?? 800, canvas.parentElement?.clientHeight ?? 800)
  void radar.refresh(origin.lat, origin.lon, rangeKm(), settings.radarSource, size, {
    radar: isPip ? true : settings.radarEnabled,
    map: isPip ? false : settings.mapEnabled,
  })
}

function currentStrikes(): EnrichedStrike[] {
  if (!origin) return []
  return lightning.inRange(origin.lat, origin.lon, settings.closeMi, settings.rangeMi, 20 * 60_000)
}

function raiseAlert(strike: EnrichedStrike): void {
  const rank = strike.classification === 'overhead' ? 2 : strike.classification === 'close' ? 1 : 0
  const cur = alert
    ? alert.classification === 'overhead'
      ? 2
      : alert.classification === 'close'
        ? 1
        : 0
    : -1
  const stillFresh = performance.now() < alertUntil && alert
  if (stillFresh && cur > rank) return
  if (stillFresh && cur === rank && alert && strike.rangeKm >= alert.rangeKm) return
  alert = strike
  alertUntil = performance.now() + 20_000
}

function onNewStrike(raw: Parameters<NonNullable<LightningNet['onStrike']>>[0]): void {
  if (!origin || !settings.lightningEnabled) return
  const hit = enrich(raw, origin.lat, origin.lon, settings.closeMi, settings.rangeMi)
  if (!hit) return
  if (hit.classification === 'close' || hit.classification === 'overhead') {
    raiseAlert(hit)
    audio.strike(true, hit.classification === 'overhead')
  }
  updateHud(currentStrikes())
}

function updateHud(strikes: EnrichedStrike[]): void {
  const now = Date.now()
  const close = strikes.filter((s) => s.classification === 'close' || s.classification === 'overhead')
  const last5 = strikes.filter((s) => now - s.time <= 5 * 60_000)
  el.stRange.textContent = String(strikes.length)
  el.st5.textContent = String(last5.length)
  el.stClose.textContent = String(close.length)
  const nearest = strikes[0]
  el.stNear.textContent = nearest ? formatRange(nearest.rangeKm, settings.units, 1) : '—'

  const liveAlert = alert && now <= alert.time + 20_000 ? alert : close[0] ?? null
  if (liveAlert && now - liveAlert.time < 20_000) {
    alert = liveAlert
    const title = liveAlert.classification === 'overhead' ? 'OVERHEAD STRIKE' : 'CLOSE STRIKE'
    el.alertCard.dataset.level = liveAlert.classification
    el.alertTitle.textContent = title
    el.alertDetail.textContent = `${formatRange(liveAlert.rangeKm, settings.units, 1)}  ${formatBearing(liveAlert.bearingDeg)}  ${formatAge(now - liveAlert.time)}`
  } else if (nearest && nearest.classification === 'near') {
    el.alertCard.dataset.level = 'near'
    el.alertTitle.textContent = 'NEARBY ACTIVITY'
    el.alertDetail.textContent = `Nearest ${formatRange(nearest.rangeKm, settings.units, 1)}  ${formatBearing(nearest.bearingDeg)}`
    alert = null
  } else {
    el.alertCard.dataset.level = 'clear'
    el.alertTitle.textContent = 'NO CLOSE STRIKES'
    el.alertDetail.textContent = `Threshold ${settings.closeMi} ${settings.units.toUpperCase()} · 30-30 rule`
    alert = null
  }

  const rows = strikes.slice(0, 40)
  el.log.innerHTML = rows
    .map((s) => {
      return `<div class="log-row ${s.classification}"><span>${formatBearing(s.bearingDeg)}</span><span>${s.classification.toUpperCase()} ${formatRange(s.rangeKm, settings.units, 1)}</span><span>${formatAge(now - s.time)}</span></div>`
    })
    .join('')

  el.pipRadar.dataset.state =
    !settings.radarEnabled ? 'off' : radar.status === 'live' ? 'live' : radar.status === 'error' ? 'error' : 'connecting'
  el.pipMap.dataset.state = !settings.mapEnabled ? 'off' : radar.status === 'live' ? 'live' : radar.status === 'error' ? 'error' : 'connecting'
  el.pipPrecip.dataset.state = precip.status
  el.pipLtng.dataset.state = settings.lightningEnabled ? lightning.state : 'off'
  el.pipFix.dataset.state = origin ? 'live' : 'connecting'

  if (precip.current) {
    el.precipTitle.textContent = precip.current.label
    el.precipDetail.textContent = precip.current.detail
    el.precipCard.dataset.wet = precip.current.wet ? 'yes' : 'no'
  } else {
    el.precipTitle.textContent = precip.status === 'error' ? 'UNAVAILABLE' : '—'
    el.precipDetail.textContent = precip.lastError || 'awaiting fix'
    el.precipCard.dataset.wet = 'no'
  }
}

function bind(): void {
  applyForm()

  const saveForm = (ev?: Event) => {
    settings.rangeMi = Number(el.range.value)
    settings.units = el.units.value === 'km' ? 'km' : 'mi'
    settings.radarSource = el.source.value as Settings['radarSource']
    settings.closeMi = Number(el.close.value)
    settings.sweepSec = Number(el.sweep.value)
    settings.sweepColor = el.sweepColor.value as SweepColor
    settings.sweepBright = el.sweepBright.value as SweepBright
    settings.sweepTrail = el.sweepTrail.value as SweepTrail
    settings.radarEnabled = el.radarOn.checked
    settings.mapEnabled = el.mapOn.checked
    settings.lightningEnabled = el.ltngOn.checked
    settings.audio = el.audioOn.checked
    audio.enabled = settings.audio
    persist()
    const t = ev?.target
    const visualOnly =
      t === el.sweepColor || t === el.sweepBright || t === el.sweepTrail || t === el.sweep || t === el.audioOn
    if (!visualOnly) {
      requestRadar()
      if (origin) void precip.refresh(origin.lat, origin.lon, settings.units)
    }
    if (settings.lightningEnabled) lightning.start()
    else lightning.stop()
    updateHud(currentStrikes())
  }

  for (const node of [
    el.range,
    el.units,
    el.source,
    el.close,
    el.sweep,
    el.sweepColor,
    el.sweepBright,
    el.sweepTrail,
    el.radarOn,
    el.mapOn,
    el.ltngOn,
    el.audioOn,
  ]) {
    node.addEventListener('change', saveForm)
  }

  const commitManual = () => {
    const lat = Number(el.lat.value)
    const lon = Number(el.lon.value)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return
    setOrigin({
      lat,
      lon,
      label: el.label.value.trim() || 'MANUAL',
      source: 'manual',
    })
  }
  el.lat.addEventListener('change', commitManual)
  el.lon.addEventListener('change', commitManual)
  el.label.addEventListener('change', commitManual)

  document.querySelector('#btn-geo')!.addEventListener('click', () => {
    audio.unlock()
    void locateGps()
  })
  document.querySelector('#btn-pip')!.addEventListener('click', () => {
    audio.unlock()
    void openPip()
  })
  document.querySelector('#btn-full')!.addEventListener('click', () => {
    audio.unlock()
    void toggleFullscreen()
  })
  document.querySelector('#pip-float-close')!.addEventListener('click', () => closeInPagePip())
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true })
  window.addEventListener('keydown', (ev) => {
    audio.unlock()
    const tag = (ev.target as HTMLElement | null)?.tagName
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    if (ev.key === 'Escape' && isPip) {
      void window.wxDesktop?.closePip()
      window.close()
      return
    }
    if (ev.key === 'f' || ev.key === 'F') void toggleFullscreen()
    if (ev.key === '+' || ev.key === '=') bumpRange(1)
    if (ev.key === '-' || ev.key === '_') bumpRange(-1)
    if (ev.key === 'g' || ev.key === 'G') void locateGps()
    if (!typing && (ev.key === 'p' || ev.key === 'P')) void openPip()
    if (ev.key === 'm' || ev.key === 'M') {
      el.audioOn.checked = !el.audioOn.checked
      saveForm()
    }
  })

  lightning.onStrike = onNewStrike
  lightning.onState = () => updateHud(currentStrikes())
  radar.onUpdate = () => updateHud(currentStrikes())
  precip.onUpdate = () => updateHud(currentStrikes())
}

function bumpRange(dir: number): void {
  const steps = [5, 10, 25, 50, 100, 150, 250]
  const i = Math.max(0, Math.min(steps.length - 1, steps.indexOf(settings.rangeMi) + dir))
  el.range.value = String(steps[i] ?? settings.rangeMi)
  el.range.dispatchEvent(new Event('change'))
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await document.documentElement.requestFullscreen()
}

function locateGps(): Promise<void> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      el.fixHint.textContent = 'Geolocation unavailable'
      resolve()
      return
    }
    el.fixHint.textContent = 'GPS acquiring…'
    el.pipFix.dataset.state = 'connecting'
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: settings.label || 'GPS',
          accuracyM: pos.coords.accuracy,
          source: 'gps',
        })
        resolve()
      },
      () => {
        el.fixHint.textContent = origin ? `using ${origin.source}` : 'GPS denied — enter lat/lon'
        resolve()
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
  })
}

async function locateIp(): Promise<void> {
  try {
    const res = await fetch('https://ipwho.is/')
    const json = (await res.json()) as {
      success?: boolean
      latitude?: number
      longitude?: number
      city?: string
      region?: string
    }
    if (!json.success || typeof json.latitude !== 'number' || typeof json.longitude !== 'number') return
    if (origin?.source === 'gps' || origin?.source === 'manual') return
    const label = [json.city, json.region].filter(Boolean).join(', ') || 'IP'
    setOrigin({ lat: json.latitude, lon: json.longitude, label, source: 'ip' })
  } catch {
    /* ignore */
  }
}

function loop(now: number): void {
  frames++
  if (now - fpsTs >= 500) {
    fps = (frames * 1000) / (now - fpsTs)
    frames = 0
    fpsTs = now
  }
  const strikes = origin ? currentStrikes() : []
  const liveAlert =
    alert && now < alertUntil
      ? alert
      : strikes.find((s) => s.classification === 'close' || s.classification === 'overhead') ?? null

  display.render({
    now: Date.now(),
    origin,
    rangeKm: rangeKm(),
    units: settings.units,
    sweepSec: settings.sweepSec,
    radar: isPip || settings.radarEnabled || settings.mapEnabled ? radar.frame : null,
    radarStatus: radar.status,
    strikes,
    alert: liveAlert,
    lightningState: lightning.state,
    fps,
    precip: precip.current,
    sweepColor: settings.sweepColor,
    sweepBright: settings.sweepBright,
    sweepTrail: settings.sweepTrail,
    pip: isPip,
  })
  if (floatDisplay) {
    floatDisplay.render({
      now: Date.now(),
      origin,
      rangeKm: rangeKm(),
      units: settings.units,
      sweepSec: settings.sweepSec,
      radar: radar.frame,
      radarStatus: radar.status,
      strikes,
      alert: null,
      lightningState: lightning.state,
      fps,
      precip: precip.current,
      sweepColor: settings.sweepColor,
      sweepBright: settings.sweepBright,
      sweepTrail: settings.sweepTrail,
      pip: true,
    })
  }
  requestAnimationFrame(loop)
}

function pipCssPx(): number {
  return Math.round((5 / 2.54) * 96)
}

async function openPip(): Promise<void> {
  if (isPip) return
  if (window.wxDesktop?.openPip) {
    await window.wxDesktop.openPip()
    return
  }
  const size = pipCssPx()
  const url = new URL(location.href)
  url.searchParams.set('pip', '1')
  const popup = window.open(url.toString(), 'wx-scope-pip', `popup=yes,width=${size},height=${size}`)
  if (popup) return
  const wrap = document.querySelector<HTMLDivElement>('#pip-float')
  const pipCanvas = document.querySelector<HTMLCanvasElement>('#pip-scope')
  if (!wrap || !pipCanvas) return
  wrap.hidden = false
  floatDisplay = new RadarDisplay(pipCanvas)
}

function closeInPagePip(): void {
  const wrap = document.querySelector<HTMLDivElement>('#pip-float')
  if (wrap) wrap.hidden = true
  floatDisplay = null
}

bind()
if (settings.lightningEnabled) lightning.start()
if (origin) requestRadar()
if (isPip) void locateIp()
else void locateIp().then(() => locateGps())
radar.startLoop(() => ({
  lat: origin?.lat ?? 0,
  lon: origin?.lon ?? 0,
  rangeKm: rangeKm(),
  source: settings.radarSource,
  sizePx: Math.min(canvas.parentElement?.clientWidth ?? 800, canvas.parentElement?.clientHeight ?? 800),
  enabled: Boolean(origin) && (isPip || settings.radarEnabled || settings.mapEnabled),
  layers: isPip
    ? { radar: true, map: false }
    : { radar: settings.radarEnabled, map: settings.mapEnabled },
}))
if (!isPip) {
  precip.startLoop(() => ({
    lat: origin?.lat ?? 0,
    lon: origin?.lon ?? 0,
    units: settings.units,
    enabled: Boolean(origin),
  }))
}
updateHud([])
requestAnimationFrame(loop)
