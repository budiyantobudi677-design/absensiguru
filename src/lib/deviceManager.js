// Utility for 1 Account = 1 Device Binding (Device Lock)
// Mencegah penitipan absensi antar-guru dengan mengunci akun ke perangkat HP pertama kali presensi.

import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

const DEVICE_CONFIG_TARGET = '__SYSTEM_DEVICE_BINDINGS__'

/**
 * Mendapatkan atau membuat ID unik permanen perangkat ini
 */
export async function getOrCreateDeviceId() {
  const STORAGE_KEY = 'panrita_permanent_device_id'
  
  // 1. Cek localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const localId = window.localStorage.getItem(STORAGE_KEY)
      if (localId) return localId
    }
  } catch (e) {}

  // 2. Cek Capacitor Preferences (Native Android / iOS)
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
    return isNative ? 'Apple iPhone (App Native)' : 'Apple iPhone (PWA)'
  }
  if (/iPad/i.test(ua)) {
    return isNative ? 'Apple iPad (App Native)' : 'Apple iPad (PWA)'
  }
  if (/Android/i.test(ua)) {
    return isNative ? 'Ponsel Android (APK GammaraApp)' : 'Ponsel Android (Web)'
  }
  if (/Mac/i.test(ua)) return 'Komputer Apple Mac'
  if (/Windows/i.test(ua)) return 'Komputer Windows'
  return 'Smartphone'
}

/**
 * Mengambil semua data binding perangkat dari Cloud Supabase
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
        return parsed
      }
    }
  } catch (err) {
    console.error('Error fetching device bindings:', err)
  }
  return {}
}

/**
 * Memvalidasi apakah akun diizinkan presensi di perangkat ini,
 * atau mengikat perangkat ini secara otomatis jika belum pernah terikat.
 * 
 * Return:
 * - { success: true, isBound: true, isNew: false }
 * - { success: true, isBound: true, isNew: true } -> pertama kali mengunci
 * - { success: false, error: 'DEVICE_MISMATCH', boundDeviceName, boundAt } -> ditolak karena HP guru lain
 */
export async function verifyOrBindDevice({ userId, supabase }) {
  if (!userId || !supabase) return { success: true }

  try {
    const currentDeviceId = await getOrCreateDeviceId()
    const deviceName = getDeviceModelName()
    const bindings = await fetchDeviceBindings(supabase)

    const existingBinding = bindings[userId]

    // Kasus 1: Akun ini sudah terikat pada suatu perangkat sebelumnya
    if (existingBinding && existingBinding.deviceId) {
      if (existingBinding.deviceId === currentDeviceId) {
        // Cocok! Ini adalah HP asli guru yang bersangkutan
        return { 
          success: true, 
          isBound: true, 
          isNew: false,
          deviceName: existingBinding.deviceName 
        }
      } else {
        // TIDAK COCOK! Percobaan titip absen di HP lain
        return {
          success: false,
          error: 'DEVICE_MISMATCH',
          boundDeviceName: existingBinding.deviceName || 'HP Guru Lain',
          boundAt: existingBinding.boundAt
        }
      }
    }

    // Kasus 2: Cek apakah HP ini sudah pernah dipakai & terikat oleh guru lain
    const deviceUsedByOther = Object.entries(bindings).find(([tId, info]) => info.deviceId === currentDeviceId && tId !== userId)
    if (deviceUsedByOther) {
      return {
        success: false,
        error: 'PHONE_ALREADY_USED',
        boundDeviceName: deviceUsedByOther[1]?.deviceName || 'HP Guru Lain',
        boundAt: deviceUsedByOther[1]?.boundAt
      }
    }

    // Kasus 3: Akun ini dan HP ini belum terikat pada perangkat manapun (Pertama kali presensi)
    // Otomatis kuncikan akun ke perangkat ini sekarang!
    bindings[userId] = {
      deviceId: currentDeviceId,
      deviceName: deviceName,
      boundAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const payloadStr = JSON.stringify(bindings)
    const { data: existingRow } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', DEVICE_CONFIG_TARGET)
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

    return { 
      success: true, 
      isBound: true, 
      isNew: true,
      deviceName 
    }
  } catch (err) {
    console.error('Error verifying device binding:', err)
    // Jika offline/network error, izinkan dengan peringatan
    return { success: true, fallback: true }
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
      const payloadStr = JSON.stringify(bindings)
      
      const { data: existingRow } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', DEVICE_CONFIG_TARGET)
        .limit(1)

      if (existingRow && existingRow.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: payloadStr })
          .eq('id', existingRow[0].id)
      }
      return true
    }
  } catch (err) {
    console.error('Error resetting device binding:', err)
  }
  return false
}
