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
  try {
    const currentDeviceId = await getOrCreateDeviceId()
    const bindings = await fetchDeviceBindings(supabase)
    const boundEntry = Object.entries(bindings).find(([tId, info]) => info.deviceId === currentDeviceId)
    if (!boundEntry) {
      return { isBound: false, currentDeviceId }
    }

    const [userId, info] = boundEntry
    let userName = info.userName || ''
    let userEmail = info.userEmail || ''

    if ((!userName || !userEmail) && supabase) {
      try {
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', userId).maybeSingle()
        if (p) {
          if (!userName) userName = p.full_name || p.email
          if (!userEmail) userEmail = p.email
        }
      } catch (e) {}
    }

    return {
      isBound: true,
      currentDeviceId,
      userId,
      userName: userName || userEmail || 'Guru Terdaftar',
      userEmail: userEmail || '',
      deviceName: info.deviceName || 'Ponsel Guru',
      boundAt: info.boundAt
    }
  } catch (e) {
    return { isBound: false }
  }
}

/**
 * Memvalidasi apakah akun diizinkan login / presensi di perangkat ini,
 * atau mengikat perangkat ini secara otomatis jika belum pernah terikat.
 * 
 * Return:
 * - { success: true, isBound: true, isNew: false }
 * - { success: true, isBound: true, isNew: true } -> pertama kali mengunci
 * - { success: false, error: 'DEVICE_MISMATCH', boundDeviceName, boundAt } -> ditolak karena akun terikat di HP lain
 * - { success: false, error: 'PHONE_ALREADY_USED', boundUserName, boundDeviceName, boundAt } -> ditolak karena HP milik guru lain
 */
export async function verifyOrBindDevice({ userId, userName = '', userEmail = '', userRole = 'guru', supabase }) {
  if (!userId || !supabase) return { success: true }

  // Pengecualian: Admin, Kepala Sekolah, dan Pengembang bebas login dari perangkat manapun (misal laptop dinas/komputer kantor)
  const isExemptRole = userRole === 'admin' || userRole === 'kepsek' || userRole === 'pengembang' || userRole === 'developer'
  if (isExemptRole) {
    return { success: true, isExempt: true }
  }

  try {
    const currentDeviceId = await getOrCreateDeviceId()
    const deviceName = getDeviceModelName()
    const bindings = await fetchDeviceBindings(supabase)

    const existingBinding = bindings[userId]

    // Kasus 1: Akun ini sudah terikat pada suatu perangkat sebelumnya
    if (existingBinding && existingBinding.deviceId) {
      if (existingBinding.deviceId === currentDeviceId) {
        // Cocok! Ini adalah HP asli guru yang bersangkutan.
        // Perbarui nama & email jika sebelumnya kosong
        if ((!existingBinding.userName || !existingBinding.userEmail) && (userName || userEmail)) {
          bindings[userId] = {
            ...existingBinding,
            userName: userName || existingBinding.userName || '',
            userEmail: userEmail || existingBinding.userEmail || '',
            updatedAt: new Date().toISOString()
          }
          saveBindingsToCloud(bindings, supabase).catch(() => {})
        }

        return { 
          success: true, 
          isBound: true, 
          isNew: false,
          deviceName: existingBinding.deviceName 
        }
      } else {
        // TIDAK COCOK! Percobaan login / titip absen di HP lain
        return {
          success: false,
          error: 'DEVICE_MISMATCH',
          boundDeviceName: existingBinding.deviceName || 'HP Pribadi Anda',
          boundAt: existingBinding.boundAt
        }
      }
    }

    // Kasus 2: Cek apakah HP ini sudah pernah dipakai & terikat oleh guru/tendik lain
    const deviceUsedByOther = Object.entries(bindings).find(([tId, info]) => info.deviceId === currentDeviceId && tId !== userId)
    if (deviceUsedByOther) {
      let otherUserName = deviceUsedByOther[1]?.userName || deviceUsedByOther[1]?.userEmail || ''
      if (!otherUserName && supabase) {
        try {
          const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', deviceUsedByOther[0]).maybeSingle()
          if (p) otherUserName = p.full_name || p.email
        } catch (e) {}
      }

      return {
        success: false,
        error: 'PHONE_ALREADY_USED',
        boundUserId: deviceUsedByOther[0],
        boundUserName: otherUserName || 'Guru Lain',
        boundDeviceName: deviceUsedByOther[1]?.deviceName || 'HP Guru Lain',
        boundAt: deviceUsedByOther[1]?.boundAt
      }
    }

    // Kasus 3: Akun ini dan HP ini belum terikat pada perangkat manapun (Pertama kali login/presensi)
    // Otomatis kuncikan akun ke perangkat ini sekarang!
    bindings[userId] = {
      deviceId: currentDeviceId,
      deviceName: deviceName,
      userName: userName || '',
      userEmail: userEmail || '',
      boundAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await saveBindingsToCloud(bindings, supabase)

    return { 
      success: true, 
      isBound: true, 
      isNew: true,
      deviceName 
    }
  } catch (err) {
    console.error('Error verifying device binding:', err)
    return { success: false, error: 'NETWORK_ERROR', message: err.message }
  }
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
