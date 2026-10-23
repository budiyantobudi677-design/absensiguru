// Utility for Managing Cloud & Local Registry of Deleted Attendance Records
// Memastikan data riwayat presensi yang dihapus oleh Admin BENAR-BENAR HILANG
// seketika dari seluruh dashboard (Guru, Tendik, Admin, Kepsek),
// terlepas dari apakah Row-Level Security (RLS) PostgreSQL mengizinkan physical delete atau tidak.

export const DELETED_ATTENDANCE_TARGET = '__SYSTEM_DELETED_ATTENDANCE__'
const LOCAL_STORAGE_KEY = 'panrita_deleted_attendance_ids'

/**
 * Mengambil registry ID presensi yang telah dihapus dari Cloud Supabase & LocalStorage
 * @param {object} supabase 
 * @returns {Promise<{ deletedIds: string[] }>}
 */
export async function fetchDeletedAttendanceRegistry(supabase) {
  let cloudIds = []

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', DELETED_ATTENDANCE_TARGET)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const parsed = JSON.parse(data[0].pesan || '{}')
        if (Array.isArray(parsed?.deletedIds)) {
          cloudIds = parsed.deletedIds.map(String)
        }
      }
    } catch (err) {
      console.warn('Gagal membaca registry absensi terhapus dari cloud:', err)
    }
  }

  // Gabungkan dengan cache lokal
  try {
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (rawLocal) {
      const localIds = JSON.parse(rawLocal)
      if (Array.isArray(localIds)) {
        localIds.forEach(id => {
          const strId = String(id)
          if (strId && !cloudIds.includes(strId)) {
            cloudIds.push(strId)
          }
        })
      }
    }
  } catch (e) {}

  // Simpan balik ke localStorage agar cepat
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cloudIds))
  } catch (e) {}

  return { deletedIds: cloudIds }
}

/**
 * Mencatat presensi yang dihapus ke Cloud Supabase & LocalStorage serta mencoba physical delete
 * @param {object} supabase 
 * @param {string[]} idsToDelete 
 * @param {object} metadata 
 * @returns {Promise<boolean>}
 */
export async function recordDeletedAttendance(supabase, idsToDelete = [], metadata = {}) {
  if (!Array.isArray(idsToDelete) || idsToDelete.length === 0) return true
  const stringIds = idsToDelete.map(String).filter(Boolean)
  if (stringIds.length === 0) return true

  // 1. Coba physical DELETE di Supabase table 'absensi'
  if (supabase) {
    try {
      await supabase.from('absensi').delete().in('id', stringIds)
    } catch (err) {
      console.warn('Physical delete from absensi table warning:', err)
    }
  }

  // 2. Ambil registry saat ini
  const currentReg = await fetchDeletedAttendanceRegistry(supabase)
  const combined = Array.from(new Set([...currentReg.deletedIds, ...stringIds]))

  // 3. Simpan ke LocalStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(combined))
  } catch (e) {}

  // 4. Simpan ke Cloud Supabase (tabel pengumuman dengan target_type khusus)
  if (supabase) {
    try {
      const payload = JSON.stringify({
        deletedIds: combined,
        lastDeletedCount: stringIds.length,
        updatedAt: new Date().toISOString(),
        metadata: metadata || {}
      })

      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', DELETED_ATTENDANCE_TARGET)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: payload })
          .eq('id', existing[0].id)
      } else {
        await supabase
          .from('pengumuman')
          .insert([{
            pesan: payload,
            target_type: DELETED_ATTENDANCE_TARGET,
            target_users: ''
          }])
      }

      // Bersihkan juga dari Cloud Mirroring Layer (__SYSTEM_ATTENDANCE_LATEST__)
      try {
        const { data: latestRows } = await supabase
          .from('pengumuman')
          .select('*')
          .eq('target_type', '__SYSTEM_ATTENDANCE_LATEST__')
          .limit(1)

        if (latestRows && latestRows.length > 0) {
          const list = JSON.parse(latestRows[0].pesan || '[]')
          if (Array.isArray(list)) {
            const filtered = list.filter(item => !combined.includes(String(item.id)))
            await supabase
              .from('pengumuman')
              .update({ pesan: JSON.stringify(filtered) })
              .eq('id', latestRows[0].id)
          }
        }
      } catch (e) {}
    } catch (err) {
      console.warn('Gagal menyimpan registry absensi terhapus ke cloud:', err)
    }
  }

  return true
}

/**
 * Filter data absensi agar catatan yang telah dihapus tidak tampil
 * @param {Array} list 
 * @param {object} registry 
 * @returns {Array}
 */
export function filterActiveAttendance(list = [], registry = { deletedIds: [] }) {
  if (!Array.isArray(list) || list.length === 0) return []
  const deletedSet = new Set((registry?.deletedIds || []).map(String))
  if (deletedSet.size === 0) return list

  return list.filter(item => {
    if (!item || !item.id) return true
    return !deletedSet.has(String(item.id))
  })
}
