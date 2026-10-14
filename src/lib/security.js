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
 * Deteksi apakah perangkat saat ini adalah iOS (iPhone / iPad / iPod)
 */
export function isIOSDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  return /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Deteksi apakah perangkat saat ini adalah Android
 */
export function isAndroidDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return true
  const ua = navigator.userAgent || ''
  return /Android/i.test(ua)
}

/**
 * Deteksi apakah pengguna sedang membuka di Tab Samaran (Incognito / Private Browsing) pada iOS
 */
export async function isIncognitoMode() {
  if (typeof window === 'undefined') return false
  try {
    // 1. Deteksi Quota Storage (iOS Safari & Chrome membatasi kuota sangat rendah di private mode, < 500MB)
    if (navigator.storage && navigator.storage.estimate) {
      const { quota } = await navigator.storage.estimate()
      if (quota && quota < 500 * 1024 * 1024) {
        return true
      }
    }

    // 2. Deteksi FileSystem API
    if ('webkitRequestFileSystem' in window) {
      const isPrivateFS = await new Promise((resolve) => {
        window.webkitRequestFileSystem(
          window.TEMPORARY,
          100,
          () => resolve(false),
          () => resolve(true)
        )
      })
      if (isPrivateFS) return true
    }

    // 3. Fallback IndexedDB check
    const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS/i.test(navigator.userAgent)
    if (isSafari && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        const testDb = window.indexedDB.open('__test_incognito__')
        await new Promise((resolve, reject) => {
          testDb.onsuccess = () => resolve(true)
          testDb.onerror = () => reject(false)
        })
      } catch {
        return true
      }
    }
  } catch (err) {
    console.warn('Gagal uji incognito:', err)
  }
  return false
}

/**
 * Cek pembatasan silang perangkat (Cross-Device Lock)
 * - Akun Android dilarang login/akses di iPhone
 * - Akun iPhone dilarang login/akses di Android
 */
export function checkCrossDeviceAccess(profile) {
  if (!profile) return { allowed: true }

  const tipe = profile.tipe_perangkat || (profile.id ? localStorage.getItem(`guru_tipe_perangkat_${profile.id}`) : null) || 'android'
  const isIOS = isIOSDevice()
  const isAndroid = isAndroidDevice()

  // Jika akun terdaftar Android tapi dibuka di iPhone/iPad
  if (tipe === 'android' && isIOS) {
    return {
      allowed: false,
      reason: 'wrong_device',
      message: 'Akses Ditolak: Akun Anda terdaftar sebagai pengguna Android. Anda tidak dapat menggunakan perangkat iPhone/iOS untuk mengakses aplikasi.'
    }
  }

  // Jika akun terdaftar iPhone tapi dibuka di Android
  if (tipe === 'iphone' && isAndroid) {
    return {
      allowed: false,
      reason: 'wrong_device',
      message: 'Akses Ditolak: Akun Anda terdaftar sebagai pengguna iPhone. Anda tidak dapat menggunakan perangkat Android untuk mengakses aplikasi.'
    }
  }

  return { allowed: true }
}

/**
 * Verifikasi apakah lingkungan perangkat saat ini diizinkan untuk melakukan presensi.
 * Aturan:
 * 1. Di Aplikasi Native Resmi (APK Android): Diizinkan untuk presensi mandiri akun Android.
 * 2. Akun iPhone: Diizinkan presensi di browser Safari atau Chrome iOS pada tab reguler.
 * 3. Tab Samaran (Incognito/Private) di iPhone: DIBLOKIR.
 * 4. Akun Android di browser web: DIBLOKIR (Wajib APK).
 * 5. Penggunaan silang (Android di iPhone / iPhone di Android): DIBLOKIR.
 */
export function verifyAttendancePlatform(profile, isIncognito = false) {
  // 1. Cek silang perangkat
  const crossCheck = checkCrossDeviceAccess(profile)
  if (!crossCheck.allowed) {
    return {
      allowed: false,
      platform: 'cross_device_blocked',
      message: crossCheck.message
    }
  }

  const tipe = profile?.tipe_perangkat || (profile?.id ? localStorage.getItem(`guru_tipe_perangkat_${profile.id}`) : null) || 'android'
  const isIOS = isIOSDevice()

  // Skenario A: Aplikasi Native Resmi (APK Android)
  if (Capacitor.isNativePlatform()) {
    if (tipe === 'iphone') {
      return {
        allowed: false,
        platform: 'cross_device_blocked',
        message: 'Akses Ditolak: Akun Anda terdaftar sebagai pengguna iPhone. Silakan gunakan perangkat iPhone Anda.'
      }
    }
    return {
      allowed: true,
      platform: 'native_app',
      message: 'Aplikasi Resmi Terverifikasi'
    }
  }

  // Skenario B: Akun iPhone di Browser (Safari atau Chrome iOS)
  if (tipe === 'iphone' && isIOS) {
    if (isIncognito) {
      return {
        allowed: false,
        platform: 'incognito_blocked',
        message: 'Presensi Ditolak: Mode Tab Samaran (Incognito / Private) terdeteksi. Silakan gunakan tab reguler untuk presensi.'
      }
    }

    const ua = navigator.userAgent || ''
    const isSafari = /Safari/i.test(ua)
    const isChromeIOS = /CriOS/i.test(ua)

    if (isSafari || isChromeIOS) {
      return {
        allowed: true,
        platform: isChromeIOS ? 'ios_chrome' : 'ios_safari',
        message: `Browser ${isChromeIOS ? 'Chrome' : 'Safari'} iPhone Terverifikasi`
      }
    } else {
      return {
        allowed: false,
        platform: 'unsupported_browser',
        message: 'Pengguna iPhone hanya dapat presensi menggunakan browser Safari atau Chrome resmi di iPhone.'
      }
    }
  }

  // Skenario C: Akun Android di Browser
  return {
    allowed: false,
    platform: 'web_browser',
    message: '🔒 Presensi Mandiri Hanya Tersedia di Aplikasi Resmi (APK)'
  }
}
