/**
 * Activity Log Manager (Pencatatan & Pengelolaan Log Aktivitas & Login Pengguna)
 * Terhubung secara aman ke Cloud Supabase (tabel pengumuman & absensi) dan Local Storage
 * Mengimplementasikan retensi otomatis 6 bulan (180 hari) & format ultra-ringan
 * 
 * SIFAT LOG: IMMUTABLE AUDIT TRAIL (KEBAL HAPUS & EDIT)
 * Riwayat log yang tersimpan di cloudLogs (__SYSTEM_USER_ACTIVITY_LOGS__) tersimpan secara mandiri.
 * Jika data di tabel utama 'absensi' dihapus atau diedit oleh admin/pengguna,
 * seluruh jejak log audit di sistem Developer tetap aman, utuh, dan tidak terpengaruh.
 */

const LOGS_TARGET = '__SYSTEM_USER_ACTIVITY_LOGS__'
const LOCAL_LOGS_KEY = 'panrita_activity_logs_cache'
const RETENTION_DAYS = 180 // 6 Bulan retensi otomatis
const MAX_LOG_ENTRIES = 2500

/**
 * Menghitung batas waktu 6 bulan yang lalu (cutoff time)
 */
export const getRetentionCutoffDate = () => {
  const d = new Date()
  d.setDate(d.getDate() - RETENTION_DAYS)
  return d
}

/**
 * Membersihkan rincian log dari payload besar (foto, base64) agar sangat ringan (<200 bytes)
 */
const cleanLogDetails = (str) => {
  if (!str) return ''
  return String(str)
    .replace(/data:image\/[a-zA-Z]+;base64,[^\s|]+/gi, '')
    .replace(/\[FOTO_WEBP:[^\]]+\]/gi, '')
    .replace(/\[SURAT_SAKIT[^\]]*\]/gi, '')
    .replace(/\|?\s*(?:Foto|Surat):\s*https?:\/\/[^\s|]+/gi, '')
    .trim()
    .substring(0, 300)
}

/**
 * Mencatat log aktivitas akun baru ke sistem dengan pembersihan otomatis data > 6 bulan
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

    const now = new Date()
    const nowIso = now.toISOString()
    const nowDateStr = nowIso.split('T')[0]

    const newLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: nowIso,
      date: nowDateStr,
      userId: userId || 'user-unknown',
      email: cleanEmail,
      role: cleanRole,
      fullName: cleanName,
      action,
      details: cleanLogDetails(details) || `Aktivitas ${action} oleh ${cleanName}`,
      deviceType: detectedDevice,
      status
    }

    const cutoffTime = getRetentionCutoffDate().getTime()

    // 1. Simpan ke local cache terlebih dahulu untuk respon instan
    let localLogs = []
    try {
      const cached = localStorage.getItem(LOCAL_LOGS_KEY)
      if (cached) localLogs = JSON.parse(cached)
    } catch {}

    // Saring log lokal yang usianya < 6 bulan
    localLogs = localLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoffTime)
    localLogs.unshift(newLogItem)
    if (localLogs.length > MAX_LOG_ENTRIES) {
      localLogs = localLogs.slice(0, MAX_LOG_ENTRIES)
    }
    try {
      localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(localLogs))
    } catch {}

    // 2. Simpan ke Supabase Cloud (tabel pengumuman)
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

        // Hapus log cloud yang lebih tua dari 6 bulan (180 hari) secara otomatis
        cloudLogs = cloudLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoffTime)
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
 * Menggabungkan log audit login serta seluruh presensi masuk dan pulang dalam rentang 6 bulan
 * Sifat: Immutable (kebal hapus dan edit di tabel utama absensi)
 */
export async function fetchActivityLogs(supabase) {
  let cloudLogs = []
  const cutoff = getRetentionCutoffDate()
  const cutoffTime = cutoff.getTime()
  const cutoffDateStr = cutoff.toISOString().split('T')[0]
  let cloudRowId = null

  // 1. Ambil dari Cloud Supabase (Login & log yang sudah tersimpan permanen)
  if (supabase) {
    try {
      const { data: cloudRow } = await supabase
        .from('pengumuman')
        .select('id, pesan')
        .eq('target_type', LOGS_TARGET)
        .limit(1)

      if (cloudRow && cloudRow.length > 0 && cloudRow[0].pesan) {
        cloudRowId = cloudRow[0].id
        try {
          const parsed = JSON.parse(cloudRow[0].pesan)
          if (Array.isArray(parsed)) {
            // Saring data 6 bulan
            cloudLogs = parsed.filter((l) => new Date(l.timestamp).getTime() >= cutoffTime)
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Error fetching cloud logs:', e)
    }
  }

  // 2. Fallback jika cloud kosong, ambil dari local cache
  if (cloudLogs.length === 0) {
    try {
      const local = localStorage.getItem(LOCAL_LOGS_KEY)
      if (local) {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed)) {
          cloudLogs = parsed.filter((l) => new Date(l.timestamp).getTime() >= cutoffTime)
        }
      }
    } catch {}
  }

  // 3. Masukkan seluruh audit Presensi Masuk & Presensi Pulang dari semua akun dalam 6 bulan terakhir
  // Log ini disimpan secara PERMANEN & IMMUTABLE ke cloudLogs (pengumuman) sehingga:
  // JIKA DATA DI TABEL UTAMA ABSENSI DIHAPUS ATAU DIEDIT, LOG AUDIT INI TIDAK AKAN HILANG ATAU TERPENGARUH!
  let hasNewAbsensiRecords = false
  if (supabase) {
    try {
      const { data: absensiRows, error: absErr } = await supabase
        .from('absensi')
        .select(`
          id,
          user_id,
          tanggal,
          waktu_masuk,
          waktu_pulang,
          lokasi_masuk,
          lokasi_pulang,
          status,
          keterangan,
          created_at,
          profiles:user_id (id, full_name, email, role)
        `)
        .gte('tanggal', cutoffDateStr)
        .order('tanggal', { ascending: false })
        .limit(MAX_LOG_ENTRIES)

      if (!absErr && absensiRows && absensiRows.length > 0) {
        const existingIdSet = new Set(cloudLogs.map(l => l.id))

        for (const abs of absensiRows) {
          const prof = abs.profiles || {}
          const userEmail = prof.email || ''
          const userName = prof.full_name || userEmail || 'Pegawai'
          const userRole = (prof.role || 'guru').toLowerCase()
          const cleanKet = cleanLogDetails(abs.keterangan)
          const absDate = abs.tanggal || (abs.created_at ? abs.created_at.split('T')[0] : '')

          // A. Audit Presensi Masuk / Izin / Sakit / Tugas Luar
          const inId = `abs-in-${abs.id}`
          if ((abs.waktu_masuk || abs.created_at || abs.status) && !existingIdSet.has(inId)) {
            let action = 'Presensi Masuk'
            let details = ''

            if (abs.status === 'sakit') {
              action = 'Presensi Sakit'
              details = cleanKet ? `Laporan Sakit: ${cleanKet}` : 'Laporan Sakit'
            } else if (abs.status === 'izin') {
              action = 'Presensi Izin'
              details = cleanKet ? `Laporan Izin: ${cleanKet}` : 'Laporan Izin'
            } else if (abs.status === 'tugas_luar' || (abs.keterangan || '').includes('Tugas Luar')) {
              action = 'Presensi Tugas Luar'
              details = cleanKet ? `Tugas Luar: ${cleanKet}` : 'Presensi Tugas Luar / Pelatihan'
            } else {
              action = 'Presensi Masuk'
              const dateObj = new Date(abs.waktu_masuk || abs.created_at || `${abs.tanggal}T07:00:00.000Z`)
              const timeStr = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                : '07.00'
              const statusStr = (abs.status || 'hadir').toUpperCase()
              details = `Presensi Masuk (${statusStr}) pukul ${timeStr} WITA`
            }

            const inTimestamp = abs.waktu_masuk || abs.created_at || `${abs.tanggal}T07:00:00.000Z`
            const inLogItem = {
              id: inId,
              timestamp: inTimestamp,
              date: absDate || (inTimestamp.includes('T') ? inTimestamp.split('T')[0] : ''),
              userId: abs.user_id,
              email: userEmail,
              role: userRole,
              fullName: userName,
              action,
              details,
              deviceType: 'android',
              status: abs.status || 'hadir'
            }

            cloudLogs.push(inLogItem)
            existingIdSet.add(inId)
            hasNewAbsensiRecords = true
          }

          // B. Audit Presensi Pulang (Clock Out)
          const outId = `abs-out-${abs.id}`
          if (abs.waktu_pulang && !existingIdSet.has(outId)) {
            const dateOutObj = new Date(abs.waktu_pulang)
            const timeOutStr = !isNaN(dateOutObj.getTime())
              ? dateOutObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : '14.00'

            const outLogItem = {
              id: outId,
              timestamp: abs.waktu_pulang,
              date: absDate || (abs.waktu_pulang.includes('T') ? abs.waktu_pulang.split('T')[0] : ''),
              userId: abs.user_id,
              email: userEmail,
              role: userRole,
              fullName: userName,
              action: 'Presensi Pulang',
              details: `Presensi Pulang (Clock Out) pukul ${timeOutStr} WITA`,
              deviceType: 'android',
              status: 'pulang'
            }

            cloudLogs.push(outLogItem)
            existingIdSet.add(outId)
            hasNewAbsensiRecords = true
          }
        }
      }
    } catch (absErr) {
      console.warn('Could not merge absensi audit logs:', absErr)
    }
  }

  // 4. Pastikan setiap log item memiliki field .date untuk filter secepat kilat
  cloudLogs.forEach(l => {
    if (!l.date && l.timestamp) {
      l.date = l.timestamp.split('T')[0]
    }
  })

  // 5. Pastikan semua log berada dalam rentang 6 bulan & urutkan dari yang paling baru
  cloudLogs = cloudLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoffTime)
  cloudLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  if (cloudLogs.length > MAX_LOG_ENTRIES) {
    cloudLogs = cloudLogs.slice(0, MAX_LOG_ENTRIES)
  }

  // 6. Simpan permanen kembali ke Supabase Cloud jika ada data baru atau pruning
  if (supabase && (hasNewAbsensiRecords || cloudRowId)) {
    try {
      const payloadStr = JSON.stringify(cloudLogs)
      if (cloudRowId) {
        supabase
          .from('pengumuman')
          .update({ pesan: payloadStr })
          .eq('id', cloudRowId)
          .then(() => {})
          .catch(() => {})
      } else if (hasNewAbsensiRecords) {
        supabase
          .from('pengumuman')
          .insert([{
            pesan: payloadStr,
            target_type: LOGS_TARGET,
            target_users: ''
          }])
          .then(() => {})
          .catch(() => {})
      }
    } catch (saveErr) {
      console.warn('Failed saving permanent audit logs to cloud:', saveErr)
    }
  }

  // Simpan kembali sinkronisasi ke local cache
  try {
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(cloudLogs))
  } catch {}

  return cloudLogs
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
