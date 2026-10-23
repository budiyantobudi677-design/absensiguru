// Utility for Audio Sound Notifications
// Menggunakan Web Audio API (Synthesized Oscillators) sehingga:
// 1. Tidak membutuhkan file .mp3 / .wav eksternal (anti-CORS, anti-gagal download, 100% offline ready).
// 2. Sangat jernih dan berbunyi seketika tanpa latency pada browser, WebView Android, dan iOS.
// 3. Suara chime elegan berstandar aplikasi perpesanan modern.

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    if (!audioCtx) {
      audioCtx = new AudioContextClass()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch (e) {
    return null
  }
}

// Listener untuk mengaktifkan audio context saat pengguna pertama kali berinteraksi (tap / klik)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    } catch (e) {}
  }
  window.addEventListener('click', unlockAudio, { once: true, passive: true })
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true })
}

// Cache untuk mencegah notifikasi audio berbunyi ganda (deduplikasi ID & debounce)
const playedTimestamps = new Map()

/**
 * Memainkan suara notifikasi (Chime Tone)
 * @param {'message' | 'announcement' | 'disposition'} type
 * @param {string|number|null} soundKey - ID unik pesan/pengumuman untuk deduplikasi suara
 */
export function playNotificationSound(type = 'message', soundKey = null) {
  try {
    const nowMs = Date.now()
    if (soundKey) {
      const keyStr = `${type}_${soundKey}`
      const lastPlayed = playedTimestamps.get(keyStr)
      if (lastPlayed && nowMs - lastPlayed < 3000) {
        return // Sudah dibunyikan kurang dari 3 detik lalu
      }
      playedTimestamps.set(keyStr, nowMs)
      // Bersihkan cache lama jika melebihi 100 entri
      if (playedTimestamps.size > 100) {
        const threshold = nowMs - 15000
        for (const [k, v] of playedTimestamps.entries()) {
          if (v < threshold) playedTimestamps.delete(k)
        }
      }
    }

    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Master Gain
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.28, now)
    masterGain.connect(ctx.destination)

    if (type === 'announcement') {
      // 3-Tone Chime megah untuk pengumuman sekolah: E5 (659Hz) -> G#5 (830Hz) -> B5 (987Hz)
      const tones = [
        { freq: 659.25, time: 0, dur: 0.18 },
        { freq: 830.61, time: 0.12, dur: 0.2 },
        { freq: 987.77, time: 0.25, dur: 0.38 }
      ]

      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(t.freq, now + t.time)

        noteGain.gain.setValueAtTime(0, now + t.time)
        noteGain.gain.linearRampToValueAtTime(0.3, now + t.time + 0.02)
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + t.time + t.dur)

        osc.connect(noteGain)
        noteGain.connect(masterGain)

        osc.start(now + t.time)
        osc.stop(now + t.time + t.dur + 0.02)
      })
    } else {
      // 2-Tone Chime jernih untuk pesan obrolan & disposisi: 587.33Hz (D5) -> 880Hz (A5)
      const tones = [
        { freq: 587.33, time: 0, dur: 0.14 },
        { freq: 880.00, time: 0.1, dur: 0.32 }
      ]

      tones.forEach(t => {
        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(t.freq, now + t.time)

        noteGain.gain.setValueAtTime(0, now + t.time)
        noteGain.gain.linearRampToValueAtTime(0.28, now + t.time + 0.02)
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + t.time + t.dur)

        osc.connect(noteGain)
        noteGain.connect(masterGain)

        osc.start(now + t.time)
        osc.stop(now + t.time + t.dur + 0.02)
      })
    }
  } catch (err) {
    console.warn('Could not play notification sound:', err)
  }
}
