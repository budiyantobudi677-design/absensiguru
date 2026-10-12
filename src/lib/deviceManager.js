// Utility for 1 Account = 1 Device Binding (Device Lock)
// Mencegah login dan absensi ganda antar-guru dengan mengunci akun ke perangkat HP pertama kali presensi/login.

import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

const DEVICE_CONFIG_TARGET = '__SYSTEM_DEVICE_BINDINGS__'
const STORAGE_KEY = 'panrita_permanent_device_id'
const CACHED_BINDINGS_KEY = 'panrita_cached_device_bindings'

/**
 * Mendapatkan atau membuat ID unik permanen perangkat ini
 */
export async function getOrCreateDeviceId() {
  // 1. Cek localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const localId = window.localStorage.getItem(STORAGE_KEY)
      if (localId) return localId
    }
  } catch (e) {}

  // 2. Cek Capacitor Preferences (Native Android / iOS SharedPreferences)
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY })
    if (value) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, value)
      }
      return value
    }
  } catch (e) {}

  // 3. Jika belum ada, buat UUID unik baru untuk perangkat ini
  let newId = ''
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    newId = 'DEV-' + crypto.randomUUID()
  } else {
    newId = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)
  }

  // Simpan secara permanen di kedua storage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, newId)
    }
    await Preferences.set({ key: STORAGE_KEY, value: newId })
  } catch (e) {}

  return newId
}

/**
 * Mendeteksi nama/model perangkat yang mudah dibaca manusia
 */
export function getDeviceModelName() {
  if (typeof window === 'undefined') return 'Perangkat Tidak Dikenal'
  
  const ua = navigator.userAgent || ''
  const isNative = Capacitor.isNativePlatform()

  if (/iPhone/i.test(ua)) {
    return isNative ? 'Apple iPhone (App Native)' : 'Apple iPhone (Safari)'
  }
  if (/iPad/i.test(ua)) {
    return isNative ? 'Apple iPad (App Native)' : 'Apple iPad (Safari)'
  }
  if (/Android/i.test(ua)) {
    return isNative ? 'Ponsel Android (APK GammaraApp)' : 'Ponsel Android (Web Chrome)'
  }
  if (/Mac/i.test(ua)) return 'Komputer Apple Mac'
  if (/Windows/i.test(ua)) return 'Komputer Windows'
  return 'Smartphone'
}

/**
 * Mengambil semua data binding perangkat dari Cloud Supabase (dengan fallback cache lokal)
 */
export async function fetchDeviceBindings(supabase) {
  if (!supabase) return {}
  try {
    const { data, error } = await supabase
      .from('pengumuman')
      .select('id, pesan')
      .eq('target_type', DEVICE_CONFIG_TARGET)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const parsed = JSON.parse(data[0].pesan)
      if (parsed && typeof parsed === 'object') {
        // Cache data binding ke storage lokal
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(CACHED_BINDINGS_KEY, JSON.stringify(parsed))
          }
        } catch (e) {}
        return parsed
      }
    }
  } catch (err) {
    console.warn('Error fetching device bindings, mencoba cache lokal:', err)
  }

  // Fallback ke cache lokal jika terjadi kegagalan jaringan
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached = window.localStorage.getItem(CACHED_BINDINGS_KEY)
      if (cached) return JSON.parse(cached)
    }
  } catch (e) {}

  return {}
}

/**
 * Memeriksa apakah perangkat saat ini sudah terikat dengan salah satu akun guru
 */
export async function getDeviceBoundOwner(supabase) {
  return { isBound: false }
}

/**
 * Memvalidasi apakah akun diizinkan login / presensi di perangkat ini.
 * Fitur kunci perangkat (1 perangkat 1 akun) telah dinonaktifkan sesuai permintaan sekolah.
 */
export async function verifyOrBindDevice({ userId, userName = '', userEmail = '', userRole = 'guru', supabase } = {}) {
  // Fitur kunci 1 perangkat 1 akun dinonaktifkan: Bebas login & presensi di perangkat manapun
  return { success: true, isExempt: true }
}


/**
 * Menyimpan data binding ke Supabase Cloud
 */
async function saveBindingsToCloud(bindings, supabase) {
  const payloadStr = JSON.stringify(bindings)
  
  // Simpan juga ke cache lokal
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CACHED_BINDINGS_KEY, payloadStr)
    }
  } catch (e) {}

  const { data: existingRow } = await supabase
    .from('pengumuman')
    .select('id')
    .eq('target_type', DEVICE_CONFIG_TARGET)
    .order('id', { ascending: false })
    .limit(1)

  if (existingRow && existingRow.length > 0) {
    await supabase
      .from('pengumuman')
      .update({ pesan: payloadStr })
      .eq('id', existingRow[0].id)
  } else {
    await supabase
      .from('pengumuman')
      .insert([{
        pesan: payloadStr,
        target_type: DEVICE_CONFIG_TARGET,
        target_users: ''
      }])
  }
}

/**
 * Admin me-reset kunci perangkat seorang guru (jika guru ganti HP resmi)
 */
export async function resetDeviceBinding({ userId, supabase }) {
  if (!userId || !supabase) return false
  try {
    const bindings = await fetchDeviceBindings(supabase)
    if (bindings[userId]) {
      delete bindings[userId]
      await saveBindingsToCloud(bindings, supabase)
      return true
    }
  } catch (err) {
    console.error('Error resetting device binding:', err)
  }
  return false
}
