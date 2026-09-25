export class AudioCue {
  private ctx: AudioContext | null = null
  enabled = true

  unlock(): void {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    void this.ctx.resume()
  }

  strike(close: boolean, overhead: boolean): void {
    if (!this.enabled) return
    if (!this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = overhead ? 200 : close ? 400 : 900
    osc.type = overhead ? 'sawtooth' : close ? 'square' : 'triangle'
    osc.frequency.setValueAtTime(overhead ? 180 : close ? 520 : 1760, now)
    osc.frequency.exponentialRampToValueAtTime(overhead ? 90 : close ? 220 : 880, now + (overhead ? 0.35 : close ? 0.16 : 0.05))
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(overhead ? 0.22 : close ? 0.14 : 0.04, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (overhead ? 0.45 : close ? 0.22 : 0.07))
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
  }
}
