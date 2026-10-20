import { Preferences } from '@capacitor/preferences'

const OFFLINE_QUEUE_KEY = 'offlineAbsensi'
const LAST_USER_KEY = 'panrita_last_active_user'
const LAST_SESSION_KEY = 'panrita_last_active_session'
const LAST_ROLE_KEY = 'panrita_last_active_role'
const SETTINGS_KEY = 'panrita_cached_settings'
const PROFILE_KEY_PREFIX = 'panrita_cached_profile_'

// Helpers sinkron untuk localStorage dengan proteksi error
const getLocal = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setLocal = (key, val) => {
  try {
    localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val))
  } catch {}
}

const removeLocal = (key) => {
  try {
    localStorage.removeItem(key)
  } catch {}
}

/**
 * Menyimpan sesi login aktif ke cache lokal dan Preferences native (Android)
 */
export async function saveActiveSession(session, user, role) {
  if (user) {
    setLocal(LAST_USER_KEY, user)
    try {
      await Preferences.set({ key: LAST_USER_KEY, value: JSON.stringify(user) })
    } catch {}
  }
  if (session) {
    setLocal(LAST_SESSION_KEY, session)
    try {
      await Preferences.set({ key: LAST_SESSION_KEY, value: JSON.stringify(session) })
    } catch {}
  }
  if (role) {
    setLocal(LAST_ROLE_KEY, role)
    if (user?.id) {
      setLocal(`panrita_role_${user.id}`, role)
    }
    try {
      await Preferences.set({ key: LAST_ROLE_KEY, value: String(role) })
    } catch {}
  }
}

/**
 * Mengambil sesi login tersimpan saat perangkat luring (offline)
 */
export async function getActiveSession() {
  let user = null
  let session = null
  let role = null

  try {
    const localUser = getLocal(LAST_USER_KEY)
    if (localUser) user = JSON.parse(localUser)
  } catch {}

  try {
    const localSession = getLocal(LAST_SESSION_KEY)
    if (localSession) session = JSON.parse(localSession)
  } catch {}

  role = getLocal(LAST_ROLE_KEY) || (user?.id ? getLocal(`panrita_role_${user.id}`) : null)

  // Fallback dari native Preferences jika localStorage kosong
  if (!user) {
    try {
      const { value: prefUser } = await Preferences.get({ key: LAST_USER_KEY })
      if (prefUser) {
        user = JSON.parse(prefUser)
        setLocal(LAST_USER_KEY, prefUser)
      }
    } catch {}
  }

  if (!session && user) {
    session = { user }
  }

  return { session, user, role }
}

/**
 * Menghapus sesi saat pengguna secara sadar mengklik Keluar (Logout)
 */
export async function clearActiveSession() {
  removeLocal(LAST_USER_KEY)
  removeLocal(LAST_SESSION_KEY)
  removeLocal(LAST_ROLE_KEY)
  removeLocal('panrita_developer_session')
  try {
    await Preferences.remove({ key: LAST_USER_KEY })
    await Preferences.remove({ key: LAST_SESSION_KEY })
    await Preferences.remove({ key: LAST_ROLE_KEY })
  } catch {}
}

/**
 * Menyimpan profil pengguna ke cache lokal
 */
export function cacheUserProfile(userId, profile) {
  if (!userId || !profile) return
  setLocal(`${PROFILE_KEY_PREFIX}${userId}`, profile)
}

/**
 * Mengambil profil pengguna dari cache lokal
 */
export function getCachedUserProfile(userId) {
  if (!userId) return null
  try {
    const val = getLocal(`${PROFILE_KEY_PREFIX}${userId}`)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

/**
 * Menyimpan pengaturan sekolah ke cache lokal
 */
export function cacheSchoolSettings(settings) {
  if (!settings) return
  setLocal(SETTINGS_KEY, settings)
}

/**
 * Mengambil pengaturan sekolah dari cache lokal
 */
export function getCachedSchoolSettings() {
  try {
    const val = getLocal(SETTINGS_KEY)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

/**
 * Menyimpan data presensi luring ke antrean lokal
 */
export function enqueueOfflineAttendance(record) {
  try {
    const current = JSON.parse(getLocal(OFFLINE_QUEUE_KEY) || '[]')
    current.push({
      ...record,
      queued_at: new Date().toISOString()
    })
    setLocal(OFFLINE_QUEUE_KEY, current)
    return current
  } catch {
    return []
  }
}

/**
 * Membaca antrean presensi luring
 */
export function getOfflineAttendanceQueue(userId = null) {
  try {
    const all = JSON.parse(getLocal(OFFLINE_QUEUE_KEY) || '[]')
    if (!userId) return all
    return all.filter(r => r.user_id === userId && r.tanggal > '2026-10-09')
  } catch {
    return []
  }
}

/**
 * Melakukan sinkronisasi data presensi luring ke Supabase saat online
 */
export async function syncOfflineAttendanceQueue(supabase, currentUser = null) {
  const queue = JSON.parse(getLocal(OFFLINE_QUEUE_KEY) || '[]')
  if (!queue || queue.length === 0) {
    return { successCount: 0, remainingCount: 0 }
  }

  const activeUserId = currentUser?.id || null
  let successCount = 0
  const remaining = []

  for (const record of queue) {
    // Abaikan data lama uji coba sebelum 10 Okt 2026
    if (!record.user_id || !record.tanggal || record.tanggal <= '2026-10-09') {
      continue
    }

    // Jika sinkronisasi dipanggil dalam konteks user tertentu, simpan rekaman user lain
    if (activeUserId && record.user_id !== activeUserId) {
      remaining.push(record)
      continue
    }

    try {
      if (record.jenis === 'masuk') {
        const { data: exist } = await supabase
          .from('absensi')
          .select('id')
          .eq('user_id', record.user_id)
          .eq('tanggal', record.tanggal)
          .limit(1)

        if (!exist || exist.length === 0) {
          const { error } = await supabase.from('absensi').insert({
            user_id: record.user_id,
            waktu_masuk: record.waktu,
            tanggal: record.tanggal,
            lokasi_masuk: record.loc,
            status: 'hadir'
          })
          if (!error) {
            successCount++
          } else {
            remaining.push(record)
          }
        } else {
          // Sudah ada di server, tandai sukses
          successCount++
        }
      } else if (record.jenis === 'pulang') {
        const { error } = await supabase
          .from('absensi')
          .update({
            waktu_pulang: record.waktu,
            lokasi_pulang: record.loc
          })
          .eq('user_id', record.user_id)
          .eq('tanggal', record.tanggal)

        if (!error) {
          successCount++
        } else {
          remaining.push(record)
        }
      } else if (record.jenis === 'sakit' || record.jenis === 'izin') {
        const { data: exist } = await supabase
          .from('absensi')
          .select('id')
          .eq('user_id', record.user_id)
          .eq('tanggal', record.tanggal)
          .limit(1)

        if (!exist || exist.length === 0) {
          const { error } = await supabase.from('absensi').insert({
            user_id: record.user_id,
            waktu_masuk: record.waktu,
            tanggal: record.tanggal,
            lokasi_masuk: record.loc,
            status: record.jenis,
            keterangan: record.keterangan
          })
          if (!error) {
            successCount++
          } else {
            remaining.push(record)
          }
        } else {
          successCount++
        }
      } else if (record.jenis === 'tugas_luar') {
        const { data: exist } = await supabase
          .from('absensi')
          .select('id')
          .eq('user_id', record.user_id)
          .eq('tanggal', record.tanggal)
          .limit(1)

        if (!exist || exist.length === 0) {
          const { error } = await supabase.from('absensi').insert({
            user_id: record.user_id,
            waktu_masuk: record.waktu_masuk || record.waktu,
            waktu_pulang: record.waktu_pulang || record.waktu,
            tanggal: record.tanggal,
            lokasi_masuk: record.loc,
            lokasi_pulang: record.loc,
            status: 'hadir',
            keterangan: record.keterangan
          })
          if (!error) {
            successCount++
          } else {
            remaining.push(record)
          }
        } else {
          successCount++
        }
      }
    } catch (errRecord) {
      console.warn('Gagal sinkron data presensi luring:', errRecord)
      remaining.push(record)
    }
  }

  if (remaining.length > 0) {
    setLocal(OFFLINE_QUEUE_KEY, remaining)
  } else {
    removeLocal(OFFLINE_QUEUE_KEY)
  }

  return { successCount, remainingCount: remaining.length }
}
