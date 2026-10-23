/**
 * Activity Log Manager (Pencatatan & Pengelolaan Log Aktivitas & Login Pengguna)
 * Terhubung secara aman ke Cloud Supabase (tabel pengumuman) dan Local Storage
 */

const LOGS_TARGET = '__SYSTEM_USER_ACTIVITY_LOGS__'
const LOCAL_LOGS_KEY = 'panrita_activity_logs_cache'
const MAX_LOG_ENTRIES = 250

/**
 * Mencatat log aktivitas akun baru ke sistem
 */
export async function recordActivityLog({
  userId,
  email,
  role = 'guru',
  fullName = '',
  action = 'Login Aplikasi',
  details = '',
  deviceType = '',
  status = 'success',
  supabase
}) {
  try {
    const cleanEmail = (email || '').trim().toLowerCase()
    const cleanRole = (role || 'user').toLowerCase()
    const cleanName = fullName || cleanEmail || 'Pengguna'

    // Deteksi tipe perangkat jika belum disediakan
    let detectedDevice = deviceType
    if (!detectedDevice) {
      if (typeof window !== 'undefined') {
        const ua = navigator.userAgent || ''
        if (/android/i.test(ua)) detectedDevice = 'android'
        else if (/iphone|ipad|ipod/i.test(ua)) detectedDevice = 'iphone'
        else detectedDevice = 'web'
      } else {
        detectedDevice = 'web'
      }
    }

    const newLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId: userId || 'user-unknown',
      email: cleanEmail,
      role: cleanRole,
      fullName: cleanName,
      action,
      details: details || `Aktivitas ${action} oleh ${cleanName}`,
      deviceType: detectedDevice,
      status
    }

    // 1. Simpan ke local cache terlebih dahulu untuk respon cepat
    let localLogs = []
    try {
      const cached = localStorage.getItem(LOCAL_LOGS_KEY)
      if (cached) localLogs = JSON.parse(cached)
    } catch {}
    localLogs.unshift(newLogItem)
    if (localLogs.length > MAX_LOG_ENTRIES) {
      localLogs = localLogs.slice(0, MAX_LOG_ENTRIES)
    }
    try {
      localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(localLogs))
    } catch {}

    // 2. Simpan permanen ke Supabase Cloud (tabel pengumuman)
    if (supabase) {
      try {
        const { data: existing } = await supabase
          .from('pengumuman')
          .select('id, pesan')
          .eq('target_type', LOGS_TARGET)
          .limit(1)

        let cloudLogs = []
        if (existing && existing.length > 0 && existing[0].pesan) {
          try {
            const parsed = JSON.parse(existing[0].pesan)
            if (Array.isArray(parsed)) cloudLogs = parsed
          } catch {}
        }

        cloudLogs.unshift(newLogItem)
        if (cloudLogs.length > MAX_LOG_ENTRIES) {
          cloudLogs = cloudLogs.slice(0, MAX_LOG_ENTRIES)
        }

        const payloadStr = JSON.stringify(cloudLogs)

        if (existing && existing.length > 0) {
          await supabase
            .from('pengumuman')
            .update({ pesan: payloadStr })
            .eq('id', existing[0].id)
        } else {
          await supabase
            .from('pengumuman')
            .insert([{
              pesan: payloadStr,
              target_type: LOGS_TARGET,
              target_users: ''
            }])
        }
      } catch (cloudErr) {
        console.warn('Gagal sync log aktivitas ke Cloud:', cloudErr)
      }
    }

    return newLogItem
  } catch (err) {
    console.warn('Error recording activity log:', err)
    return null
  }
}

/**
 * Mengambil daftar seluruh log aktivitas & login pengguna
 * Menggabungkan log audit dan riwayat aktivitas absensi terbaru
 */
export async function fetchActivityLogs(supabase) {
  let combinedLogs = []

  // 1. Ambil dari Cloud Supabase
  if (supabase) {
    try {
      const { data: cloudRow } = await supabase
        .from('pengumuman')
        .select('pesan')
        .eq('target_type', LOGS_TARGET)
        .limit(1)

      if (cloudRow && cloudRow.length > 0 && cloudRow[0].pesan) {
        try {
          const parsed = JSON.parse(cloudRow[0].pesan)
          if (Array.isArray(parsed)) {
            combinedLogs = [...parsed]
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Error fetching cloud logs:', e)
    }
  }

  // 2. Fallback jika cloud kosong, ambil dari local cache
  if (combinedLogs.length === 0) {
    try {
      const local = localStorage.getItem(LOCAL_LOGS_KEY)
      if (local) {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed)) combinedLogs = parsed
      }
    } catch {}
  }

  // 3. Tambahkan riwayat absensi terbaru sebagai log aktivitas nyata pengguna jika belum ada
  if (supabase) {
    try {
      const { data: recentAbsensi } = await supabase
        .from('absensi')
        .select(`
          id,
          user_id,
          tanggal,
          jam_masuk,
          jam_pulang,
          status,
          tipe_perangkat,
          created_at,
          profiles:user_id (id, full_name, email, role)
        `)
        .order('id', { ascending: false })
        .limit(40)

      if (recentAbsensi && recentAbsensi.length > 0) {
        for (const abs of recentAbsensi) {
          const prof = abs.profiles || {}
          const userEmail = prof.email || 'guru@sekolah.edu'
          const userName = prof.full_name || userEmail
          const userRole = prof.role || 'guru'
          const timeStr = abs.jam_masuk || '07:00'
          const absDate = abs.tanggal || new Date().toISOString().split('T')[0]
          const logTimestamp = abs.created_at || `${absDate}T${timeStr}:00.000Z`

          // Masuk log
          const absLogItem = {
            id: `abs-log-${abs.id}`,
            timestamp: logTimestamp,
            userId: abs.user_id,
            email: userEmail,
            role: userRole,
            fullName: userName,
            action: 'Presensi Kehadiran',
            details: `Presensi Masuk (${(abs.status || 'Hadir').toUpperCase()}) jam ${timeStr}`,
            deviceType: abs.tipe_perangkat || 'android',
            status: 'success'
          }

          // Cek apakah sudah ada log serupa
          if (!combinedLogs.some(l => l.id === absLogItem.id)) {
            combinedLogs.push(absLogItem)
          }
        }
      }
    } catch (absErr) {
      console.warn('Could not merge recent absensi logs:', absErr)
    }
  }

  // 4. Urutkan berdasarkan timestamp descending (terbaru di atas)
  combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Simpan kembali sinkronisasi ke local cache
  try {
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(combinedLogs.slice(0, MAX_LOG_ENTRIES)))
  } catch {}

  return combinedLogs
}

/**
 * Menghapus/membersihkan seluruh log aktivitas
 */
export async function clearActivityLogs(supabase) {
  try {
    localStorage.removeItem(LOCAL_LOGS_KEY)
    if (supabase) {
      await supabase
        .from('pengumuman')
        .delete()
        .eq('target_type', LOGS_TARGET)
    }
    return true
  } catch (e) {
    console.error('Error clearing activity logs:', e)
    return false
  }
}
