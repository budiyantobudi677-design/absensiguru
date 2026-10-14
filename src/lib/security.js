import { supabase } from './supabase'
import { registerPlugin, Capacitor } from '@capacitor/core'

// Register native plugin jika ada di runtime Capacitor Android
const SecurityLocation = registerPlugin('SecurityLocation')

// Cache offset server agar tidak perlu hit API terus-menerus
// offset = serverTime - clientLocalTime
let serverTimeOffsetMs = 0
let lastSyncTimestamp = 0

/**
 * Sinkronisasi selisih waktu client dengan server Supabase / WorldTime API.
 * Menghitung selisih (offset) secara presisi dengan memperhitungkan Round-Trip Time (RTT).
 */
export async function syncServerTime() {
  const t0 = Date.now()
  try {
    // 1. Coba ambil waktu dari RPC / REST Supabase
    // Menggunakan query ringan yang mengembalikan waktu server
    const { data, error } = await supabase.rpc('get_server_time')
    const t1 = Date.now()
    const rtt = t1 - t0

    if (!error && data) {
      const serverDate = new Date(data)
      if (!isNaN(serverDate.getTime())) {
        serverTimeOffsetMs = (serverDate.getTime() + Math.round(rtt / 2)) - t1
        lastSyncTimestamp = t1
        return serverTimeOffsetMs
      }
    }
  } catch (err) {
    // Abaikan error RPC jika fungsi belum dibuat di database
  }

  // 2. Fallback: HEAD request ke endpoint Supabase untuk membaca HTTP Header 'date'
  try {
    const t0 = Date.now()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      }
    })
    const t1 = Date.now()
    const serverHeaderDate = res.headers.get('date')
    if (serverHeaderDate) {
      const serverTime = new Date(serverHeaderDate).getTime()
      if (!isNaN(serverTime)) {
        const rtt = t1 - t0
        serverTimeOffsetMs = (serverTime + Math.round(rtt / 2)) - t1
        lastSyncTimestamp = t1
        return serverTimeOffsetMs
      }
    }
  } catch (err) {
    console.warn('Gagal membaca header server time:', err)
  }

  // 3. Fallback alternatif menggunakan WorldTimeAPI publik jika Supabase tidak mengembalikan header
  try {
    const t0 = Date.now()
    const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', { cache: 'no-store' })
    const data = await res.json()
    const t1 = Date.now()
    if (data && data.utc_datetime) {
      const serverTime = new Date(data.utc_datetime).getTime()
      if (!isNaN(serverTime)) {
        const rtt = t1 - t0
        serverTimeOffsetMs = (serverTime + Math.round(rtt / 2)) - t1
        lastSyncTimestamp = t1
        return serverTimeOffsetMs
      }
    }
  } catch (err) {
    console.warn('Gagal sinkronisasi fallback world time:', err)
  }

  if (isNaN(serverTimeOffsetMs) || !isFinite(serverTimeOffsetMs)) {
    serverTimeOffsetMs = 0
  }
  return serverTimeOffsetMs
}

/**
 * Mendapatkan objek Date terkini yang disinkronkan dengan server.
 * Kebal terhadap manipulasi jam manual di pengaturan ponsel / laptop.
 */
export function getSecureServerDate() {
  const ms = (typeof serverTimeOffsetMs === 'number' && !isNaN(serverTimeOffsetMs) && isFinite(serverTimeOffsetMs))
    ? serverTimeOffsetMs
    : 0
  const date = new Date(Date.now() + ms)
  return isNaN(date.getTime()) ? new Date() : date
}

/**
 * Mendapatkan ISO string waktu terkini dari server
 */
export function getSecureServerIsoString() {
  try {
    const d = getSecureServerDate()
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Mendapatkan tanggal lokal format YYYY-MM-DD berbasis jam server
 */
export function getSecureLocalDateString() {
  try {
    const d = getSecureServerDate()
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-CA')
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return new Date().toLocaleDateString('en-CA')
  }
}

/**
 * Mendapatkan koordinat GPS aman yang mendeteksi Fake GPS / Mock Location
 * @param {Object} options 
 * @returns {Promise<{latitude: number, longitude: number, altitude: number, accuracy: number, heading: number, isMock: boolean}>}
 */
export async function getSecureLocation(options = { timeout: 8000, enableHighAccuracy: true }) {
  const timeoutMs = options.timeout || 8000

  // Jika di Android Native (Capacitor), gunakan SecurityLocation plugin dengan proteksi timeout race
  if (Capacitor.isNativePlatform()) {
    try {
      const nativePromise = SecurityLocation.getSecureLocation()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Native GPS Timeout')), timeoutMs)
      )
      const result = await Promise.race([nativePromise, timeoutPromise])
      if (result && result.latitude !== undefined && result.longitude !== undefined) {
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          altitude: result.altitude,
          accuracy: result.accuracy,
          heading: result.heading,
          speed: result.speed,
          isMock: Boolean(result.isMock)
        }
      }
    } catch (nativeErr) {
      console.warn('SecurityLocation native plugin call failed or timed out, fallback to web geolocation:', nativeErr)
    }
  }

  // Web Browser / Fallback Geolocation dengan proteksi timeout keras & fallback akurasi
  const getWebPosition = (geoOptions) => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Perangkat tidak mendukung geolokasi'))
        return
      }

      let isDone = false
      const safetyTimer = setTimeout(() => {
        if (!isDone) {
          isDone = true
          reject(new Error('Web geolocation timed out'))
        }
      }, (geoOptions.timeout || 7000) + 1000)

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isDone) return
          isDone = true
          clearTimeout(safetyTimer)
          const isMock = Boolean(
            pos.coords.isMock || 
            pos.coords.mocked || 
            (pos.coords.accuracy === 0)
          )

          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            isMock
          })
        },
        (err) => {
          if (isDone) return
          isDone = true
          clearTimeout(safetyTimer)
          reject(err)
        },
        geoOptions
      )
    })
  }

  try {
    return await getWebPosition({ maximumAge: 0, ...options })
  } catch (firstErr) {
    // Jika GPS High Accuracy gagal mengunci (misal di dalam ruangan), coba toleransi network/cache
    if (options.enableHighAccuracy) {
      try {
        return await getWebPosition({
          enableHighAccuracy: false,
          maximumAge: 120000,
          timeout: 5000
        })
      } catch (fallbackErr) {
        throw firstErr
      }
    }
    throw firstErr
  }
}

/**
 * Verifikasi apakah lingkungan perangkat saat ini diizinkan untuk melakukan presensi.
 * Aturan Baru:
 * 1. Di Aplikasi Native Resmi (APK Android / iOS Native App): Diizinkan untuk presensi mandiri.
 * 2. Di SEMUA Browser Web (Chrome, Opera, Safari, dll baik di HP maupun Laptop/PC): DIBLOKIR.
 */
export function verifyAttendancePlatform() {
  if (Capacitor.isNativePlatform()) {
    return {
      allowed: true,
      platform: 'native_app',
      message: 'Aplikasi Resmi Terverifikasi'
    }
  }

  // Semua browser (mobile browser maupun desktop) diblokir untuk presensi mandiri
  return {
    allowed: false,
    platform: 'web_browser',
    message: '🔒 Presensi Mandiri Hanya Tersedia di Aplikasi Resmi (APK)'
  }
}
